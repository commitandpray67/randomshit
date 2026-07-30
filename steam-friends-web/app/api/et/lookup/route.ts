import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("names") ?? "";
  const names = raw
    .split(",")
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 50); // cap batch size

  if (names.length === 0) {
    return NextResponse.json({ terrorists: [] }, { headers: CORS });
  }

  const rows = (await sql`
    SELECT
      nickname,
      COUNT(*)::int                                         AS flag_count,
      (SELECT comment
         FROM et_flags f2
        WHERE f2.nickname = f.nickname
        ORDER BY created_at DESC
        LIMIT 1)                                            AS latest_comment
    FROM et_flags f
    WHERE nickname = ANY(${names})
    GROUP BY nickname
  `) as { nickname: string; flag_count: number; latest_comment: string }[];

  return NextResponse.json({ terrorists: rows }, { headers: CORS });
}
