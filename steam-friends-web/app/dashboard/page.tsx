import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { syncUser, getActiveFriends, getRemovedFriends } from "@/lib/tracker";
import { sql } from "@/lib/db";
import AdSlot from "@/components/AdSlot";

export const dynamic = "force-dynamic";

// Private, per-user page — keep it out of search indexes.
export const metadata = { robots: { index: false, follow: false } };

function fmt(d: string | Date | null): string {
  if (!d) return "unknown";
  return new Date(d).toISOString().slice(0, 10);
}

function initialAvatar() {
  // Fallback grey square is handled by CSS background; empty src is fine.
  return "";
}

export default async function Dashboard() {
  const steamId = await getSession();
  if (!steamId) redirect("/");

  // Refresh on visit so the page reflects the latest list, but at most once
  // per minute per user — repeated refreshes just show stored data instead of
  // hammering Steam's API. (The daily cron catches changes while you're away.)
  const sync = await syncUser(steamId, 60);

  const user = (
    await sql`SELECT display_name, avatar, last_polled FROM users WHERE steam_id = ${steamId}`
  )[0];
  const canShow = sync.status === "ok" || sync.status === "throttled";
  const active = canShow ? await getActiveFriends(steamId) : [];
  const removed = canShow ? await getRemovedFriends(steamId) : [];

  return (
    <main>
      <div className="topbar">
        {user?.avatar ? (
          <img className="avatar" src={user.avatar} alt="" />
        ) : (
          <div className="avatar" />
        )}
        <div className="who">
          <div className="name">{user?.display_name ?? "Your"} </div>
          <div className="meta">
            {user?.last_polled ? `Last checked ${fmt(user.last_polled)}` : "Steam Friends Tracker"}
          </div>
        </div>
        <form action="/api/auth/logout" method="post">
          <button className="btn btn-ghost" type="submit">Log out</button>
        </form>
      </div>

      {sync.status === "private" && (
        <div className="notice">
          We couldn&apos;t read your friends list — it looks <strong>private</strong>.
          Set <em>My friends list</em> to <em>Public</em> in your Steam privacy
          settings, then refresh this page.
        </div>
      )}

      {canShow && (
        <>
          <div className="stats">
            <div className="stat ok">
              <div className="num">{active.length}</div>
              <div className="lbl">Current friends</div>
            </div>
            <div className="stat danger">
              <div className="num">{removed.length}</div>
              <div className="lbl">Unfriended you</div>
            </div>
            <div className="stat">
              <div className="num">{active.length + removed.length}</div>
              <div className="lbl">Ever tracked</div>
            </div>
          </div>

          {sync.status === "ok" && sync.firstRun && (
            <div className="card notice info">
              Saved a baseline of <strong>{sync.counts.total}</strong> friends.
              Come back later (or let the daily check run) and we&apos;ll show you
              anyone who unfriended you.
            </div>
          )}

          <AdSlot />

          {removed.length > 0 && (
            <>
              <div className="section-head">
                <h2 className="tag-removed" style={{ color: "var(--danger)" }}>
                  Unfriended you
                </h2>
                <span className="count">{removed.length}</span>
              </div>
              <div className="card list">
                {removed.map((f: any) => (
                  <div className="row" key={f.friend_steam_id}>
                    <img src={f.avatar || initialAvatar()} alt="" />
                    <div className="info">
                      <div className="n">
                        <a href={f.profile_url ?? "#"} target="_blank" rel="noreferrer">
                          {f.name ?? f.friend_steam_id}
                        </a>
                      </div>
                      <div className="s">
                        friends {fmt(f.friend_since)} → gone {fmt(f.removed_at)}
                      </div>
                    </div>
                    <span className="badge badge-removed">removed</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="section-head">
            <h2>Current friends</h2>
            <span className="count">{active.length}</span>
          </div>
          <div className="card list">
            {active.length === 0 ? (
              <div className="empty">No friends found yet.</div>
            ) : (
              active.map((f: any) => (
                <div className="row" key={f.friend_steam_id}>
                  <img src={f.avatar || initialAvatar()} alt="" />
                  <div className="info">
                    <div className="n">
                      <a href={f.profile_url ?? "#"} target="_blank" rel="noreferrer">
                        {f.name ?? f.friend_steam_id}
                      </a>
                    </div>
                    <div className="s">friends since {fmt(f.friend_since)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </main>
  );
}
