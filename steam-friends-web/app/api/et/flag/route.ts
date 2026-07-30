import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/ratelimit";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const VALID_RANKS = new Set(["S", "A", "B", "C", "D", "F"]);

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(`et-flag:${clientIp(req)}`, 20, 60);
  if (!rl.ok) {
    return new NextResponse("Rate limited", {
      status: 429,
      headers: { ...CORS, "Retry-After": String(rl.retryAfter) },
    });
  }

  let body: {
    steamId?: unknown;
    displayName?: unknown;
    rank?: unknown;
    comment?: unknown;
    reporterId?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("Bad JSON", { status: 400, headers: CORS });
  }

  const steamId = String(body.steamId ?? "").trim();
  const displayName = String(body.displayName ?? "").trim();
  const rank = String(body.rank ?? "").trim().toUpperCase();
  const comment = String(body.comment ?? "").trim();
  const reporterId = String(body.reporterId ?? "").trim();

  if (!steamId || !rank || !comment || !reporterId) {
    return new NextResponse("Missing fields", { status: 400, headers: CORS });
  }
  if (!VALID_RANKS.has(rank)) {
    return new NextResponse("Invalid rank — must be S, A, B, C, D, or F", {
      status: 400,
      headers: CORS,
    });
  }
  if (
    steamId.length > 32 ||
    displayName.length > 64 ||
    comment.length > 500 ||
    reporterId.length > 64
  ) {
    return new NextResponse("Field too long", { status: 400, headers: CORS });
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
  const rl = rateLimit(`et-unflag:${clientIp(req)}`, 20, 60);
  if (!rl.ok) {
    return new NextResponse("Rate limited", { status: 429, headers: CORS });
  }

  let body: { steamId?: unknown; reporterId?: unknown };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("Bad JSON", { status: 400, headers: CORS });
  }

  const steamId = String(body.steamId ?? "").trim();
  const reporterId = String(body.reporterId ?? "").trim();

  if (!steamId || !reporterId) {
    return new NextResponse("Missing fields", { status: 400, headers: CORS });
  }

  await sql`
    DELETE FROM et_flags
    WHERE steam_id = ${steamId} AND reporter_id = ${reporterId}
  `;

  return NextResponse.json({ ok: true }, { headers: CORS });
}
