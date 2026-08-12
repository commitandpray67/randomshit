import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Time-weighted scoring: 90-day half-life (ln2/90 ≈ 0.00770/day).
// weight = exp(-0.00770 * age_days)  →  fresh report: 1.0, 90d ago: 0.5, 180d ago: 0.25
// weighted_score = Σ(rank_score × weight) / Σ(weight)
// Score thresholds map back to rank letter.
const SCORE_RANKS: [number, string][] = [
  [5.5, "S"], [4.5, "A"], [3.5, "B"], [2.5, "C"], [1.5, "D"],
];

function scoreToRank(score: number): string {
  for (const [thresh, rank] of SCORE_RANKS) {
    if (score >= thresh) return rank;
  }
  return "F";
}

const RANK_SCORE_CASE = `CASE rank
  WHEN 'S' THEN 6 WHEN 'A' THEN 5 WHEN 'B' THEN 4
  WHEN 'C' THEN 3 WHEN 'D' THEN 2 ELSE 1 END`;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("steam_ids") ?? "";
  const steamIds = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50);

  if (steamIds.length === 0) {
    return NextResponse.json({ terrorists: [] }, { headers: CORS });
  }

  // CTE: score each individual report, aggregate per steam_id, pick top comment
  // by highest recency-weighted score. JOIN et_player_cache for current nickname.
  const rows = (await sql`
    WITH scored AS (
      SELECT
        steam_id,
        display_name,
        comment,
        ${sql.unsafe(RANK_SCORE_CASE)}                                                    AS rs,
        EXP(-0.00770 * GREATEST(0, EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0)) AS w
      FROM et_flags
      WHERE steam_id = ANY(${steamIds})
    ),
    agg AS (
      SELECT
        steam_id,
        COUNT(*)::int                             AS flag_count,
        (SUM(rs * w) / NULLIF(SUM(w), 0))::float AS weighted_score,
        MAX(display_name)                         AS raw_display
      FROM scored
      GROUP BY steam_id
    ),
    top_c AS (
      SELECT DISTINCT ON (steam_id) steam_id, comment
      FROM scored
      ORDER BY steam_id, rs * w DESC
    )
    SELECT
      a.steam_id,
      COALESCE(c.nickname, a.raw_display)  AS display_name,
      a.flag_count,
      a.weighted_score,
      tc.comment                           AS top_comment
    FROM agg a
    JOIN top_c tc ON tc.steam_id = a.steam_id
    -- et_player_cache is keyed by nickname, so one Steam ID keeps a row per
    -- name it has ever been cached under. A plain join on steam_id would
    -- multiply the aggregate row per alias and show an arbitrary old nickname;
    -- take only the most recently cached one.
    LEFT JOIN LATERAL (
      SELECT p.nickname
      FROM et_player_cache p
      WHERE p.steam_id = a.steam_id
      ORDER BY p.cached_at DESC
      LIMIT 1
    ) c ON true
  `) as {
    steam_id: string;
    display_name: string | null;
    flag_count: number;
    weighted_score: number;
    top_comment: string;
  }[];

  return NextResponse.json({
    terrorists: rows.map((r) => ({
      steam_id:     r.steam_id,
      display_name: r.display_name,
      flag_count:   r.flag_count,
      worst_rank:   scoreToRank(r.weighted_score),
      top_comment:  r.top_comment,
    })),
  }, { headers: CORS });
}
