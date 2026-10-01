"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The admin's corner of the studio: who may edit this studio, and new studios.
 *
 * Only rendered for admins, and the API it talks to (/api/studio/admin) checks
 * again for itself. Members are added by SteamID or by pasting their Steam
 * profile link, custom ones included — whichever the admin has to hand.
 */

type Member = { steamId: string; name: string | null; avatar: string | null };

const ERRORS: Record<string, string> = {
  not_a_steam_account:
    "That isn't a Steam account. Paste a SteamID (7656…) or a steamcommunity.com profile link.",
  already_admin: "That's an admin, who can already open every studio.",
  steam_unreachable: "Couldn't reach Steam to look that up. Try again.",
  bad_channel: "That isn't a Twitch channel name: letters, numbers and _ only.",
  exists: "There's already a studio for that channel.",
  rate_limited: "Too many changes at once. Wait a minute.",
  forbidden: "Only admins can do that.",
};

async function admin(payload: Record<string, unknown>): Promise<any> {
  try {
    const res = await fetch("/api/studio/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch {
    return { ok: false, error: "network" };
  }
}

export default function StudioAdmin({ studio }: { studio: { slug: string; name: string } | null }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [who, setWho] = useState("");
  const [channel, setChannel] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const show = (data: any) => {
    if (data?.ok) {
      setError(null);
      if (Array.isArray(data.members)) setMembers(data.members);
      return true;
    }
    setError(ERRORS[data?.error] ?? `Didn't work (${data?.error ?? "unknown error"}).`);
    return false;
  };

  const load = useCallback(async () => {
    if (!studio) return;
    show(await admin({ action: "members", studio: studio.slug }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studio?.slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studio || !who.trim()) return;
    setBusy(true);
    setNote(null);
    const data = await admin({ action: "add", studio: studio.slug, who: who.trim() });
    if (show(data)) {
      const added = (data.members as Member[]).find((m) => m.steamId === data.added);
      setNote(`${added?.name ?? data.added} can now edit ${studio.name}.`);
      setWho("");
    }
    setBusy(false);
  };

  const remove = async (m: Member) => {
    if (!studio) return;
    if (!window.confirm(`Remove ${m.name ?? m.steamId} from ${studio.name}?`)) return;
    setBusy(true);
    setNote(null);
    show(await admin({ action: "remove", studio: studio.slug, steamId: m.steamId }));
    setBusy(false);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const data = await admin({ action: "create", channel, name });
    if (show(data)) {
      // Straight into it: a new studio is an empty canvas waiting to be built.
      window.location.href = `/studio/${data.slug}`;
      return;
    }
    setBusy(false);
  };

  return (
    <div className="st-admin">
      {studio && (
        <>
          <p className="st-admin-head">Who can edit {studio.name}</p>
          {members === null ? (
            <p className="st-hint">Loading…</p>
          ) : members.length === 0 ? (
            <p className="st-hint">Nobody yet. Only admins can open it.</p>
          ) : (
            <ul className="st-members">
              {members.map((m) => (
                <li key={m.steamId}>
                  {m.avatar ? <img src={m.avatar} alt="" width={22} height={22} /> : <span className="st-member-blank" />}
                  <span className="st-member-name" title={m.steamId}>
                    {m.name ?? m.steamId}
                  </span>
                  <button className="btn btn-ghost st-member-x" disabled={busy} onClick={() => void remove(m)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="st-url-row" onSubmit={add}>
            <input
              className="st-url"
              placeholder="SteamID or Steam profile link"
              value={who}
              onChange={(e) => setWho(e.target.value)}
            />
            <button className="btn" type="submit" disabled={busy || !who.trim()}>
              Add
            </button>
          </form>
          <p className="st-hint">Admins can always open every studio.</p>
        </>
      )}

      <details className="st-admin-new" open={!studio}>
        <summary>New studio</summary>
        <form onSubmit={create}>
          <label className="st-row">
            <span>Twitch channel</span>
            <input value={channel} placeholder="e.g. nayomy_cs" onChange={(e) => setChannel(e.target.value)} />
          </label>
          <label className="st-row">
            <span>Name shown in the studio (optional)</span>
            <input value={name} placeholder="defaults to the channel" onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn" type="submit" disabled={busy || !channel.trim()}>
            Create
          </button>
          <p className="st-hint">
            Starts empty, with its own OBS link, and only admins can open it until you add someone.
          </p>
        </form>
      </details>

      {note && <p className="st-hint">{note}</p>}
      {error && <p className="st-error">{error}</p>}
    </div>
  );
}
