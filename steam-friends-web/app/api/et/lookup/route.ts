import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Numeric weight so we can pick the worst rank with ORDER BY.
const RANK_ORDER = `CASE rank
  WHEN 'S' THEN 6 WHEN 'A' THEN 5 WHEN 'B' THEN 4
  WHEN 'C' THEN 3 WHEN 'D' THEN 2 WHEN 'F' THEN 1
END`;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("steam_ids") ?? "";
  const steamIds = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);

  if (steamIds.length === 0) {
    return NextResponse.json({ terrorists: [] }, { headers: CORS });
  }

  // For each flagged Steam ID return:
  //   worst_rank  — most severe rank any reporter assigned
  //   top_comment — the comment attached to that worst-rank report
  //   flag_count  — total number of reporters
  //   display_name — most recently seen FACEIT nickname
  const rows = (await sql`
    SELECT
      steam_id,
      (SELECT display_name FROM et_flags f2
       WHERE f2.steam_id = f.steam_id
       ORDER BY created_at DESC LIMIT 1)                         AS display_name,
      COUNT(*)::int                                              AS flag_count,
      (ARRAY_AGG(rank    ORDER BY ${sql.unsafe(RANK_ORDER)} DESC))[1] AS worst_rank,
      (ARRAY_AGG(comment ORDER BY ${sql.unsafe(RANK_ORDER)} DESC))[1] AS top_comment
    FROM et_flags f
    WHERE steam_id = ANY(${steamIds})
    GROUP BY steam_id
  `) as {
    steam_id: string;
    display_name: string | null;
    flag_count: number;
    worst_rank: string;
    top_comment: string;
  }[];

  return NextResponse.json({ terrorists: rows }, { headers: CORS });
}
