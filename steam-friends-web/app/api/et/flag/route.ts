import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/ratelimit";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const VALID_RANKS = new Set(["S", "A", "B", "C", "D", "F"]);

const FACEIT_USER_URL  = "https://api.faceit.com/auth/v1/resources/userinfo";
const FACEIT_MATCH_URL = "https://open.faceit.com/data/v4/matches";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// Resolves a FACEIT access token to { guid, nickname } or null.
async function getFaceitIdentity(accessToken: string): Promise<{ guid: string; nickname: string } | null> {
  try {
    const res = await fetch(FACEIT_USER_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const guid = data.sub ?? data.guid;
    if (!guid) return null;
    return { guid, nickname: data.nickname ?? "" };
  } catch {
    return null;
  }
}

// Returns true if `playerGuid` appears in either team of the given match.
// Returns true (bypass) if FACEIT_DATA_API_KEY is not configured.
async function verifyMatchParticipation(matchId: string, playerGuid: string): Promise<boolean> {
  // Same Data API key the resolve route uses; FACEIT_DATA_API_KEY allows
  // pointing match verification at a separate key if you ever split them.
  const apiKey = process.env.FACEIT_DATA_API_KEY || process.env.FACEIT_API_KEY;
  if (!apiKey) return true; // can't verify — allow through without match check

  try {
    const res = await fetch(`${FACEIT_MATCH_URL}/${encodeURIComponent(matchId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 0 },
    });
    if (!res.ok) return false;
    const match = await res.json();

    // `teams` is a map keyed by faction name. Matchmaking uses faction1/faction2
    // but tournaments and hubs use other keys, so iterate the map rather than
    // reading two hardcoded properties. Substitutes count as participants —
    // someone subbed into a match saw it just as much as the starting roster.
    type Member = { player_id?: string };
    type Faction = { roster?: Member[]; substitutes?: Member[] };

    const ids = new Set<string>();
    for (const faction of Object.values((match.teams ?? {}) as Record<string, Faction>)) {
      for (const m of faction?.roster ?? []) if (m?.player_id) ids.add(m.player_id);
      for (const m of faction?.substitutes ?? []) if (m?.player_id) ids.add(m.player_id);
    }
    return ids.has(playerGuid);
  } catch {
    return false;
  }
}

async function hashGuid(guid: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(guid));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: NextRequest) {
  // Per-IP flood guard
  const ipRl = rateLimit(`et-flag-ip:${clientIp(req)}`, 30, 60);
  if (!ipRl.ok) {
    return new NextResponse("Rate limited", {
      status: 429,
      headers: { ...CORS, "Retry-After": String(ipRl.retryAfter) },
    });
  }

  let body: {
    steamId?: unknown;
    displayName?: unknown;
    rank?: unknown;
    comment?: unknown;
    faceitAccessToken?: unknown;
    matchId?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("Bad JSON", { status: 400, headers: CORS });
  }

  const steamId          = String(body.steamId ?? "").trim();
  const displayName      = String(body.displayName ?? "").trim();
  const rank             = String(body.rank ?? "").trim().toUpperCase();
  const comment          = String(body.comment ?? "").trim();
  const faceitAccessToken = String(body.faceitAccessToken ?? "").trim();
  const matchId          = body.matchId ? String(body.matchId).trim() : null;

  if (!steamId || !rank || !comment || !faceitAccessToken) {
    return new NextResponse("Missing fields", { status: 400, headers: CORS });
  }
  if (!VALID_RANKS.has(rank)) {
    return new NextResponse("Invalid rank", { status: 400, headers: CORS });
  }
  if (steamId.length > 32 || displayName.length > 64 || comment.length > 500) {
    return new NextResponse("Field too long", { status: 400, headers: CORS });
  }

  // Verify FACEIT identity
  const identity = await getFaceitIdentity(faceitAccessToken);
  if (!identity) {
    return new NextResponse("Invalid FACEIT token", { status: 401, headers: CORS });
  }

  // If the extension sent a matchId, verify the reporter was actually in that match
  if (matchId) {
    const inMatch = await verifyMatchParticipation(matchId, identity.guid);
    if (!inMatch) {
      return new NextResponse("Not a participant in this match", { status: 403, headers: CORS });
    }
  }

  const reporterId = await hashGuid(identity.guid);

  // Per-identity rate limit: max 15 flags per day per FACEIT account
  const idRl = rateLimit(`et-flag-id:${reporterId}`, 15, 86400);
  if (!idRl.ok) {
    return new NextResponse("Too many flags from this account today", {
      status: 429,
      headers: { ...CORS, "Retry-After": String(idRl.retryAfter) },
    });
  }

  await sql`
    INSERT INTO et_flags (steam_id, display_name, rank, comment, reporter_id)
    VALUES (${steamId}, ${displayName || null}, ${rank}, ${comment}, ${reporterId})
    ON CONFLICT (reporter_id, steam_id) DO UPDATE SET
      display_name = COALESCE(EXCLUDED.display_name, et_flags.display_name),
      rank         = EXCLUDED.rank,
      comment      = EXCLUDED.comment
  `;

  return NextResponse.json({ ok: true }, { headers: CORS });
}

export async function DELETE(req: NextRequest) {
  const ipRl = rateLimit(`et-unflag-ip:${clientIp(req)}`, 20, 60);
  if (!ipRl.ok) {
    return new NextResponse("Rate limited", { status: 429, headers: CORS });
  }

  let body: { steamId?: unknown; faceitAccessToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("Bad JSON", { status: 400, headers: CORS });
  }

  const steamId           = String(body.steamId ?? "").trim();
  const faceitAccessToken = String(body.faceitAccessToken ?? "").trim();

  if (!steamId || !faceitAccessToken) {
    return new NextResponse("Missing fields", { status: 400, headers: CORS });
  }

  const identity = await getFaceitIdentity(faceitAccessToken);
  if (!identity) {
    return new NextResponse("Invalid FACEIT token", { status: 401, headers: CORS });
  }

  const reporterId = await hashGuid(identity.guid);

  await sql`
    DELETE FROM et_flags
    WHERE steam_id = ${steamId} AND reporter_id = ${reporterId}
  `;

  return NextResponse.json({ ok: true }, { headers: CORS });
}
