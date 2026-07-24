import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { syncUser, getActiveFriends, getRemovedFriends } from "@/lib/tracker";
import { sql } from "@/lib/db";
import AdSlot from "@/components/AdSlot";
import FriendsView, { type FriendRow } from "@/components/FriendsView";

export const dynamic = "force-dynamic";

// Manual refresh. Fetches from Steam at most once per 20s per user, so it can't
// be spammed to hammer the Steam API on your key.
async function refresh() {
  "use server";
  const sid = await getSession();
  if (sid) await syncUser(sid, 20);
  revalidatePath("/dashboard");
}

// Private, per-user page, keep it out of search indexes.
export const metadata = { robots: { index: false, follow: false } };

function fmt(d: string | Date | null): string {
  if (!d) return "unknown";
  return new Date(d).toISOString().slice(0, 10);
}

function ts(d: string | Date | null): number {
  return d ? new Date(d).getTime() : 0;
}

function ago(d: string | Date | null): string {
  if (!d) return "never";
  const sec = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function toRow(f: any, status: "active" | "removed"): FriendRow {
  return {
    id: f.friend_steam_id,
    name: f.name ?? f.friend_steam_id,
    url: f.profile_url ?? "",
    avatar: f.avatar ?? "",
    friendSince: fmt(f.friend_since),
    friendSinceTs: ts(f.friend_since),
    removedAt: status === "removed" ? fmt(f.removed_at) : undefined,
    status,
  };
}

export default async function Dashboard() {
  const steamId = await getSession();
  if (!steamId) redirect("/");

  // Refresh on visit so the page reflects the latest list, but at most once
  // per minute per user, repeated refreshes just show stored data instead of
  // hammering Steam's API. (The daily cron catches changes while you're away.)
  const sync = await syncUser(steamId, 60);

  const user = (
    await sql`SELECT display_name, avatar, last_polled FROM users WHERE steam_id = ${steamId}`
  )[0];
  const canShow = sync.status === "ok" || sync.status === "throttled";
  const active = canShow ? await getActiveFriends(steamId) : [];
  const removed = canShow ? await getRemovedFriends(steamId) : [];
  const activeRows = active.map((f: any) => toRow(f, "active"));
  const removedRows = removed.map((f: any) => toRow(f, "removed"));

  return (
    <main>
      <div className="topbar">
        {user?.avatar ? (
          <img className="avatar" src={user.avatar} alt="" />
        ) : (
          <div className="avatar" />
        )}
        <div className="who">
          <div className="name">{user?.display_name ?? "Your account"}</div>
          <div className="meta">
            {user?.last_polled ? `Last checked ${ago(user.last_polled)}` : "Steam Friends Tracker"}
          </div>
        </div>
        <div className="topbar-actions">
          <form action={refresh}>
            <button className="btn" type="submit">Refresh</button>
          </form>
          <form action="/api/auth/logout" method="post">
            <button className="btn btn-ghost" type="submit">Log out</button>
          </form>
        </div>
      </div>

      {sync.status === "private" && (
        <div className="notice">
          We couldn&apos;t read your friends list; it looks <strong>private</strong>.
          Set <em>My friends list</em> to <em>Public</em> in your Steam privacy
          settings, then refresh this page.
        </div>
      )}

      {canShow && sync.status === "ok" && sync.firstRun && (
        <div className="card notice info">
          Saved a baseline of <strong>{sync.counts.total}</strong> friends. Come
          back later (or let the daily check run) and we&apos;ll show you anyone
          who unfriended you.
        </div>
      )}

      {canShow && (
        <>
          <FriendsView active={activeRows} removed={removedRows} />
          <AdSlot />
        </>
      )}
    </main>
  );
}
