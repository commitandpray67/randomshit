"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Emote = { id: string; name: string; url: string };

/**
 * Browse a Twitch channel's 7TV emote set and drop one onto the canvas.
 *
 * Opens straight onto the default channel's emotes rather than an empty search
 * box — that set is the one being reached for nearly every time, and having to
 * type a name first made the common case the slow one. The search is still
 * there for everything else, and there's a way back.
 *
 * The lookup is proxied through /api/emotes so the browser never talks to 7TV
 * directly; asking it for no channel in particular is what returns the default.
 */
export default function EmotePicker({
  onPick,
  onClose,
  defaultChannel,
}: {
  onPick: (url: string, name: string) => void;
  onClose: () => void;
  /** The studio's streamer, whose set it opens on. The server's default otherwise. */
  defaultChannel?: string;
}) {
  const [channel, setChannel] = useState("");
  /** The channel currently on screen, as the server resolved it. */
  const [loaded, setLoaded] = useState<string | null>(null);
  const [emotes, setEmotes] = useState<Emote[] | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filterRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (name?: string) => {
    const c = (name ?? "").trim();
    setLoading(true);
    setError(null);
    setEmotes(null);
    setFilter("");
    try {
      const res = await fetch(c ? `/api/emotes?channel=${encodeURIComponent(c)}` : "/api/emotes", {
        cache: "no-store",
      });
      const data = await res.json();
      const label = c || "the default channel";
      if (!res.ok || !data.ok) {
        setError(
          data?.error === "channel_not_found"
            ? `No 7TV account found for "${label}".`
            : data?.error === "seventv_unreachable"
              ? "Couldn't reach 7TV just now — try again."
              : (data?.error ?? `Failed (${res.status})`),
        );
        return;
      }
      setEmotes(data.emotes);
      setLoaded(data.channel ?? c);
      // Keep the box showing whose emotes these are, so searching elsewhere and
      // coming back is obvious.
      setChannel(data.channel ?? c);
      if (data.emotes.length === 0) {
        setError(`"${data.channel ?? label}" has no 7TV emotes in their set.`);
      } else {
        // The grid is already populated, so the filter is what you want to type
        // into, not the channel box.
        requestAnimationFrame(() => filterRef.current?.focus());
      }
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Open onto the studio's streamer's set.
  useEffect(() => {
    void load(defaultChannel);
  }, [load, defaultChannel]);

  const shown = (emotes ?? []).filter((e) =>
    filter ? e.name.toLowerCase().includes(filter.toLowerCase()) : true,
  );

  return (
    <div className="st-modal-backdrop" onClick={onClose}>
      <div className="st-modal" onClick={(e) => e.stopPropagation()}>
        <div className="st-modal-head">
          <h3>7TV emotes{loaded ? ` — ${loaded}` : ""}</h3>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>

        <form
          className="st-url-row"
          onSubmit={(e) => {
            e.preventDefault();
            void load(channel);
          }}
        >
          <input
            className="st-url"
            placeholder="Another Twitch channel…"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          />
          <button className="btn" type="submit" disabled={loading || !channel.trim()}>
            {loading ? "Loading…" : "Search"}
          </button>
        </form>

        {loading && <p className="st-hint">Loading emotes…</p>}
        {error && <p className="st-error">{error}</p>}

        {emotes && emotes.length > 0 && (
          <>
            <input
              ref={filterRef}
              className="st-url"
              style={{ marginTop: "0.6rem" }}
              placeholder={`Filter ${emotes.length} emotes…`}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="st-emotes">
              {shown.map((em) => (
                <button
                  key={em.id}
                  className="st-emote"
                  title={em.name}
                  onClick={() => onPick(em.url, em.name)}
                >
                  <img src={em.url} alt={em.name} loading="lazy" />
                  <span>{em.name}</span>
                </button>
              ))}
            </div>
            {shown.length === 0 && <p className="st-hint">Nothing matches “{filter}”.</p>}
          </>
        )}
      </div>
    </div>
  );
}
