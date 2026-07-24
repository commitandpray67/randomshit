import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { getLocale } from "@/lib/locale";
import { getT } from "@/lib/i18n";
import { syncUser, getActiveFriends, getRemovedFriends } from "@/lib/tracker";
import { sql } from "@/lib/db";
import AdSlot from "@/components/AdSlot";
import FriendsView, { type FriendRow } from "@/components/FriendsView";
import RefreshButton from "@/components/RefreshButton";

export const dynamic = "force-dynamic";

async function refresh() {
  "use server";
  const sid = await getSession();
  if (sid) await syncUser(sid, 20);
  revalidatePath("/dashboard");
}

export const metadata = { robots: { index: false, follow: false } };

function fmt(d: string | Date | null, unknown: string): string {
  if (!d) return unknown;
  return new Date(d).toISOString().slice(0, 10);
}

function ts(d: string | Date | null): number {
  return d ? new Date(d).getTime() : 0;
}

function agoLocalized(
  d: string | Date | null,
  T: ReturnType<typeof getT>,
): string {
  if (!d) return T.never;
  const sec = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (sec < 60) return T.justNow;
  const min = Math.floor(sec / 60);
  if (min < 60) return T.minsAgo(min);
  const hr = Math.floor(min / 60);
  if (hr < 24) return T.hoursAgo(hr);
  return T.daysAgo(Math.floor(hr / 24));
}

function toRow(f: any, status: "active" | "removed", unknown: string): FriendRow {
  return {
    id: f.friend_steam_id,
    name: f.name ?? f.friend_steam_id,
    url: f.profile_url ?? "",
    avatar: f.avatar ?? "",
    friendSince: fmt(f.friend_since, unknown),
    friendSinceTs: ts(f.friend_since),
    removedAt: status === "removed" ? fmt(f.removed_at, unknown) : undefined,
    status,
  };
}

export default async function Dashboard() {
  const steamId = await getSession();
  if (!steamId) redirect("/");

  const locale = await getLocale();
  const T = getT(locale);

  const sync = await syncUser(steamId, 60);

  const user = (
    await sql`SELECT display_name, avatar, last_polled FROM users WHERE steam_id = ${steamId}`
  )[0];
  const canShow = sync.status === "ok" || sync.status === "throttled";
  const active = canShow ? await getActiveFriends(steamId) : [];
  const removed = canShow ? await getRemovedFriends(steamId) : [];
  const activeRows = active.map((f: any) => toRow(f, "active", T.unknown));
  const removedRows = removed.map((f: any) => toRow(f, "removed", T.unknown));

  return (
    <main>
      <div className="topbar">
        {user?.avatar ? (
          <img className="avatar" src={user.avatar} alt="" />
        ) : (
          <div className="avatar" />
        )}
        <div className="who">
          <div className="name">{user?.display_name ?? T.yourAccount}</div>
          <div className="meta">
            {user?.last_polled
              ? T.lastChecked(agoLocalized(user.last_polled, T))
              : T.appName}
          </div>
        </div>
        <div className="topbar-actions">
          <form action={refresh}>
            <RefreshButton label={T.refresh} pendingLabel={T.refreshing} />
          </form>
          <form action="/api/auth/logout" method="post">
            <button className="btn btn-ghost" type="submit">{T.logout}</button>
          </form>
        </div>
      </div>

      {sync.status === "private" && (
        <div className="notice">
          {T.privateIntro} <strong>{T.privateBold}</strong>. {T.privateAction}
        </div>
      )}

      {canShow && sync.status === "ok" && sync.firstRun && (
        <div className="card notice info">
          {T.firstRunMsg(sync.counts.total)}
        </div>
      )}

      {canShow && (
        <>
          <FriendsView active={activeRows} removed={removedRows} locale={locale} />
          <AdSlot />
        </>
      )}
    </main>
  );
}
