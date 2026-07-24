/**
 * The heart of the app: fetch a user's current friends, diff against what's
 * stored, and record new friends / unfriends / re-adds. Ported from the
 * standalone steam_friends.py, adapted to per-user Postgres rows.
 */
import { sql } from "./db";
import { getFriendList, getPlayerSummaries } from "./steam";

export type SyncResult =
  | { status: "private" }
  | { status: "throttled" }
  | {
      status: "ok";
      firstRun: boolean;
      counts: { total: number; added: number; removed: number; readded: number };
    };

/**
 * Snapshot one user's friends and update the database. Safe to call both
 * on-demand (after login) and from the scheduled cron worker.
 *
 * `minIntervalSec` throttles how often a given user actually hits Steam's API:
 * if they were polled more recently than that, we skip the fetch and return
 * "throttled" so the caller just shows already-stored data. This stops a user
 * refreshing the dashboard from spamming the Steam Web API on your key. The
 * cron passes 0 (always run).
 */
export async function syncUser(
  steamId: string,
  minIntervalSec = 0,
): Promise<SyncResult> {
  // Throttle before doing any Steam work.
  const userRow = (
    await sql`SELECT last_polled FROM users WHERE steam_id = ${steamId}`
  )[0];
  const isFirstRun = userRow?.last_polled == null;
  if (!isFirstRun && minIntervalSec > 0 && userRow?.last_polled) {
    const ageSec = (Date.now() - new Date(userRow.last_polled).getTime()) / 1000;
    if (ageSec < minIntervalSec) {
      return { status: "throttled" };
    }
  }

  // 1. Fetch current friends from Steam.
  let current;
  try {
    current = await getFriendList(steamId);
  } catch (e: any) {
    if (e?.code === "private") {
      await sql`UPDATE users SET api_visibility = 'private', last_polled = now()
                WHERE steam_id = ${steamId}`;
      return { status: "private" };
    }
    throw e;
  }

  const currentIds = current.map((f) => f.steamid);
  const summaries = currentIds.length ? await getPlayerSummaries(currentIds) : new Map();

  // 2. Load what we already know for this user.
  const known = await sql`
    SELECT friend_steam_id, status FROM friends WHERE user_steam_id = ${steamId}
  `;
  const knownMap = new Map<string, string>(
    known.map((r: any) => [r.friend_steam_id, r.status]),
  );

  const counts = { total: currentIds.length, added: 0, removed: 0, readded: 0 };
  const currentSet = new Set(currentIds);

  // 3. Upsert everyone currently present.
  await sql.begin(async (tx) => {
    for (const f of current) {
      const info = summaries.get(f.steamid);
      const name = info?.personaname ?? null;
      const since = f.friendSince ? new Date(f.friendSince * 1000) : null;
      const prevStatus = knownMap.get(f.steamid);

      await tx`
        INSERT INTO friends (user_steam_id, friend_steam_id, name, profile_url,
                             avatar, friend_since, status, last_seen)
        VALUES (${steamId}, ${f.steamid}, ${name}, ${info?.profileurl ?? null},
                ${info?.avatar ?? null}, ${since}, 'active', now())
        ON CONFLICT (user_steam_id, friend_steam_id) DO UPDATE SET
          name        = COALESCE(EXCLUDED.name, friends.name),
          profile_url = COALESCE(EXCLUDED.profile_url, friends.profile_url),
          avatar      = COALESCE(EXCLUDED.avatar, friends.avatar),
          friend_since = COALESCE(EXCLUDED.friend_since, friends.friend_since),
          status      = 'active',
          removed_at  = NULL,
          last_seen   = now()
      `;

      if (prevStatus === undefined) {
        counts.added++;
        if (!isFirstRun) await logEvent(tx, steamId, f.steamid, name, "added");
      } else if (prevStatus === "removed") {
        counts.readded++;
        await logEvent(tx, steamId, f.steamid, name, "readded");
      }
    }

    // 4. Anyone previously active but missing now = unfriended.
    const nowRemoved = await tx`
      UPDATE friends SET status = 'removed', removed_at = now()
      WHERE user_steam_id = ${steamId} AND status = 'active'
        AND friend_steam_id NOT IN ${tx(currentSet.size ? [...currentSet] : [""])}
      RETURNING friend_steam_id, name
    `;
    for (const r of nowRemoved) {
      counts.removed++;
      await logEvent(tx, steamId, r.friend_steam_id, r.name, "removed");
    }

    await tx`UPDATE users SET api_visibility = 'public', last_polled = now()
             WHERE steam_id = ${steamId}`;
  });

  return { status: "ok", firstRun: isFirstRun, counts };
}

async function logEvent(
  tx: any,
  userId: string,
  friendId: string,
  name: string | null,
  type: "added" | "removed" | "readded",
): Promise<void> {
  await tx`
    INSERT INTO events (user_steam_id, friend_steam_id, friend_name, type)
    VALUES (${userId}, ${friendId}, ${name}, ${type})
  `;
}

/** Current (active) friends for the dashboard. */
export async function getActiveFriends(steamId: string) {
  // Oldest friendships first. Unknown friend_since (nulls) sort last.
  return sql`
    SELECT friend_steam_id, name, profile_url, avatar, friend_since, first_seen
    FROM friends
    WHERE user_steam_id = ${steamId} AND status = 'active'
    ORDER BY friend_since ASC NULLS LAST
  `;
}

/** People who have unfriended you, most recent first. */
export async function getRemovedFriends(steamId: string) {
  return sql`
    SELECT friend_steam_id, name, profile_url, avatar, friend_since, removed_at
    FROM friends
    WHERE user_steam_id = ${steamId} AND status = 'removed'
    ORDER BY removed_at DESC
  `;
}
