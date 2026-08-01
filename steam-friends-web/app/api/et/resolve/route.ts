// Resolves FACEIT nicknames to Steam IDs using the FACEIT Open Data API.
// The API key is kept server-side; the extension never sees it.
// Results are cached in et_player_cache for 24 h.

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/ratelimit";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const FACEIT_API = "https://open.faceit.com/data/v4";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

type FaceitPlayer = {
  player_id?: string;
  nickname?: string;
  steam_id_64?: string;
  games?: Record<string, { game_player_id?: string }>;
};

/**
 * A Player's Steam ID64 is normally `steam_id_64`, but on some accounts that
 * field is empty while the per-game `game_player_id` still holds it — for CS2
 * and CS:GO that id *is* the Steam ID64. Checking both avoids reporting a
 * linked account as unlinked.
 */
function extractSteamId(player: FaceitPlayer): string | null {
  if (player.steam_id_64) return player.steam_id_64;
  const games = player.games ?? {};
  return games.cs2?.game_player_id || games.csgo?.game_player_id || null;
}

/**
 * `/players?nickname=` is an exact lookup and 404s on any mismatch. When it
 * misses, fall back to `/search/players`, which is fuzzy, and accept only an
 * entry whose nickname matches case-insensitively — then re-fetch by id, since
 * search results carry no Steam ID.
 */
async function fetchPlayer(nickname: string, apiKey: string): Promise<FaceitPlayer | null> {
  const auth = { headers: { Authorization: `Bearer ${apiKey}` } };

  const direct = await fetch(
    `${FACEIT_API}/players?nickname=${encodeURIComponent(nickname)}`,
    auth,
  );
  if (direct.ok) return (await direct.json()) as FaceitPlayer;
  if (direct.status !== 404) return null; // 401/429/503 — don't burn a second call

  const search = await fetch(
    `${FACEIT_API}/search/players?nickname=${encodeURIComponent(nickname)}&limit=20`,
    auth,
  );
  if (!search.ok) return null;

  const { items = [] } = (await search.json()) as { items?: { player_id?: string; nickname?: string }[] };
  const key = nickname.toLowerCase();
  const hit = items.find((i) => (i.nickname ?? "").toLowerCase() === key);
  if (!hit?.player_id) return null;

  const byId = await fetch(
    `${FACEIT_API}/players/${encodeURIComponent(hit.player_id)}`,
    auth,
  );
  return byId.ok ? ((await byId.json()) as FaceitPlayer) : null;
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(`et-resolve:${clientIp(req)}`, 60, 60);
  if (!rl.ok) {
    return new NextResponse("Rate limited", {
      status: 429,
      headers: { ...CORS, "Retry-After": String(rl.retryAfter) },
    });
  }

  // FACEIT's /players?nickname lookup is an exact match, so the nickname must
  // reach it with its original casing. Lowercase is used only as the cache key
  // and the response key, which is what callers index by.
  const raw = req.nextUrl.searchParams.get("names") ?? "";
  const byKey = new Map<string, string>(); // lowercase key → original casing
  for (const n of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const key = n.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, n);
    if (byKey.size >= 20) break;
  }
  const names = [...byKey.keys()];

  if (names.length === 0) {
    return NextResponse.json({ resolved: {} }, { headers: CORS });
  }

  const apiKey = process.env.FACEIT_API_KEY;
  if (!apiKey) {
    return new NextResponse("FACEIT_API_KEY not configured", { status: 503, headers: CORS });
  }

  // Pull warm cache entries (< 24 h old).
  const cached = (await sql`
    SELECT nickname, steam_id
    FROM et_player_cache
    WHERE nickname = ANY(${names})
      AND cached_at > now() - interval '24 hours'
  `) as { nickname: string; steam_id: string }[];

  const resolved: Record<string, string> = {};
  const cachedSet = new Set<string>();

  for (const row of cached) {
    resolved[row.nickname] = row.steam_id;
    cachedSet.add(row.nickname);
  }

  const toFetch = names.filter((n) => !cachedSet.has(n));

  // Resolve uncached nicknames in parallel via FACEIT API.
  await Promise.allSettled(
    toFetch.map(async (key) => {
      const nickname = byKey.get(key) ?? key; // original casing for the query
      const player = await fetchPlayer(nickname, apiKey);
      if (!player) return;

      const steamId = extractSteamId(player);
      const playerId: string | undefined = player.player_id;
      if (!steamId || !playerId) return; // account not linked to Steam

      resolved[key] = steamId;

      await sql`
        INSERT INTO et_player_cache (nickname, faceit_player_id, steam_id)
        VALUES (${key}, ${playerId}, ${steamId})
        ON CONFLICT (nickname) DO UPDATE SET
          faceit_player_id = EXCLUDED.faceit_player_id,
          steam_id         = EXCLUDED.steam_id,
          cached_at        = now()
      `;
    }),
  );

  return NextResponse.json({ resolved }, { headers: CORS });
}
