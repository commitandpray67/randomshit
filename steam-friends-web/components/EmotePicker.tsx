"use client";

import { useState } from "react";

type Emote = { id: string; name: string; url: string };

/**
 * Browse a Twitch channel's 7TV emote set and drop one onto the canvas.
 * The lookup is proxied through /api/emotes so the browser never talks to
 * 7TV directly.
 */
export default function EmotePicker({
  onPick,
  onClose,
}: {
  onPick: (url: string, name: string) => void;
  onClose: () => void;
}) {
  const [channel, setChannel] = useState("");
  const [emotes, setEmotes] = useState<Emote[] | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    const c = channel.trim();
    if (!c) return;
    setLoading(true);
    setError(null);
    setEmotes(null);
    try {
      const res = await fetch(`/api/emotes?channel=${encodeURIComponent(c)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(
          data?.error === "channel_not_found"
            ? `No 7TV account found for "${c}".`
            : data?.error === "seventv_unreachable"
              ? "Couldn't reach 7TV just now — try again."
              : (data?.error ?? `Failed (${res.status})`),
        );
        return;
      }
      setEmotes(data.emotes);
      if (data.emotes.length === 0) setError(`"${c}" has no 7TV emotes in their set.`);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  const shown = (emotes ?? []).filter((e) =>
    filter ? e.name.toLowerCase().includes(filter.toLowerCase()) : true,
  );

  return (
    <div className="st-modal-backdrop" onClick={onClose}>
      <div className="st-modal" onClick={(e) => e.stopPropagation()}>
        <div className="st-modal-head">
          <h3>7TV emotes</h3>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>

        <form className="st-url-row" onSubmit={search}>
          <input
            className="st-url"
            placeholder="Twitch channel name, e.g. juntella"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            autoFocus
          />
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Loading…" : "Search"}
          </button>
        </form>

        {error && <p className="st-error">{error}</p>}

        {emotes && emotes.length > 0 && (
          <>
            <input
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
          </>
        )}
      </div>
    </div>
  );
}
