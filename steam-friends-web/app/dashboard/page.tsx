import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { syncUser, getActiveFriends, getRemovedFriends } from "@/lib/tracker";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

function fmt(d: string | Date | null): string {
  if (!d) return "unknown";
  return new Date(d).toISOString().slice(0, 10);
}

export default async function Dashboard() {
  const steamId = await getSession();
  if (!steamId) redirect("/");

  // Refresh on visit too, so the page always reflects the latest list.
  // (The daily cron is what catches changes while you're away.)
  const sync = await syncUser(steamId);

  const user = (await sql`SELECT display_name FROM users WHERE steam_id = ${steamId}`)[0];
  const active = sync.status === "ok" ? await getActiveFriends(steamId) : [];
  const removed = sync.status === "ok" ? await getRemovedFriends(steamId) : [];

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>{user?.display_name ?? "Your"} friends</h1>
        <form action="/api/auth/logout" method="post">
          <button className="btn" type="submit">Log out</button>
        </form>
      </div>

      {sync.status === "private" && (
        <div className="notice">
          We couldn&apos;t read your friends list — it looks <strong>private</strong>.
          Set <em>My friends list</em> to <em>Public</em> in your Steam privacy
          settings, then refresh this page.
        </div>
      )}

      {sync.status === "ok" && sync.firstRun && (
        <div className="card">
          Saved a baseline of <strong>{sync.counts.total}</strong> friends. Come
          back later (or let the daily check run) to catch any unfriends.
        </div>
      )}

      {removed.length > 0 && (
        <>
          <h2 className="tag-removed">Unfriended you ({removed.length})</h2>
          <div className="card">
            {removed.map((f: any) => (
              <div className="row" key={f.friend_steam_id}>
                <div style={{ flex: 1 }}>
                  <a href={f.profile_url ?? "#"} target="_blank" rel="noreferrer">
                    {f.name ?? f.friend_steam_id}
                  </a>
                  <div className="muted">
                    friends {fmt(f.friend_since)} → gone {fmt(f.removed_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {active.length > 0 && (
        <>
          <h2>Current friends ({active.length})</h2>
          <div className="card">
            {active.map((f: any) => (
              <div className="row" key={f.friend_steam_id}>
                {f.avatar ? <img src={f.avatar} alt="" /> : null}
                <div style={{ flex: 1 }}>
                  <a href={f.profile_url ?? "#"} target="_blank" rel="noreferrer">
                    {f.name ?? f.friend_steam_id}
                  </a>
                  <div className="muted">friends since {fmt(f.friend_since)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
