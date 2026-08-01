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
      const res = await fetch(
        `${FACEIT_API}/players?nickname=${encodeURIComponent(nickname)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (!res.ok) return;

      const data = await res.json();
      const steamId: string | undefined = data.steam_id_64;
      const playerId: string | undefined = data.player_id;
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
