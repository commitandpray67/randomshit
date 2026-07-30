import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/ratelimit";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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

  let body: { nickname?: unknown; comment?: unknown; reporterId?: unknown };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("Bad JSON", { status: 400, headers: CORS });
  }

  const nickname = String(body.nickname ?? "").trim().toLowerCase();
  const comment = String(body.comment ?? "").trim();
  const reporterId = String(body.reporterId ?? "").trim();

  if (!nickname || !comment || !reporterId) {
    return new NextResponse("Missing fields", { status: 400, headers: CORS });
  }
  if (nickname.length > 64 || comment.length > 500 || reporterId.length > 64) {
    return new NextResponse("Field too long", { status: 400, headers: CORS });
  }

  // Upsert: same reporter can update their comment on the same nickname
  await sql`
    INSERT INTO et_flags (nickname, comment, reporter_id)
    VALUES (${nickname}, ${comment}, ${reporterId})
    ON CONFLICT (reporter_id, nickname)
    DO UPDATE SET comment = EXCLUDED.comment
  `;

  return NextResponse.json({ ok: true }, { headers: CORS });
}

export async function DELETE(req: NextRequest) {
  const rl = rateLimit(`et-unflag:${clientIp(req)}`, 20, 60);
  if (!rl.ok) {
    return new NextResponse("Rate limited", { status: 429, headers: CORS });
  }

  let body: { nickname?: unknown; reporterId?: unknown };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("Bad JSON", { status: 400, headers: CORS });
  }

  const nickname = String(body.nickname ?? "").trim().toLowerCase();
  const reporterId = String(body.reporterId ?? "").trim();

  if (!nickname || !reporterId) {
    return new NextResponse("Missing fields", { status: 400, headers: CORS });
  }

  await sql`
    DELETE FROM et_flags
    WHERE nickname = ${nickname} AND reporter_id = ${reporterId}
  `;

  return NextResponse.json({ ok: true }, { headers: CORS });
}
