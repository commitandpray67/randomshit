import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { FPS } from "@/lib/jayc";

// GET /api/jayc/leaderboard?limit=25
//
// One call serves the whole in-game board screen: who the caller is (so the
// game can show "sign in" or their name), the fastest clears, and the caller's
// own placing even when they are far below the visible top.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const steamId = await getSession();

  const raw = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 100) : 25;

  const top = await sql`
    SELECT
      s.steam_id,
      COALESCE(u.display_name, 'UNKNOWN GOONER') AS name,
      s.run_frames,
      s.kills,
      s.score,
      s.modifier,
      s.quotes,
      s.runs,
      s.updated_at
    FROM jayc_scores s
    JOIN users u ON u.steam_id = s.steam_id
    WHERE NOT s.hidden
    ORDER BY s.run_frames ASC, s.updated_at ASC
    LIMIT ${limit}
  `;

  // The caller's placing across the whole board, not just the page above.
  let me: Record<string, unknown> | null = null;
  if (steamId) {
    const rows = await sql`
      WITH ranked AS (
        SELECT
          steam_id,
          run_frames,
          runs,
          RANK() OVER (ORDER BY run_frames ASC) AS rank
        FROM jayc_scores
        WHERE NOT hidden
      )
      SELECT
        u.steam_id,
        COALESCE(u.display_name, 'UNKNOWN GOONER') AS name,
        r.run_frames,
        r.runs,
        r.rank
      FROM users u
      LEFT JOIN ranked r ON r.steam_id = u.steam_id
      WHERE u.steam_id = ${steamId}
    `;
    const row = rows[0];
    if (row) {
      me = {
        steamId: row.steam_id,
        name: row.name,
        // null until they finish a run — the game shows "NO CLEAR YET".
        runFrames: row.run_frames ?? null,
        runs: row.runs ?? 0,
        rank: row.rank ?? null,
      };
    }
  }

  return NextResponse.json(
    {
      fps: FPS,
      me,
      top: top.map((r, i) => ({
        rank: i + 1,
        steamId: r.steam_id,
        name: r.name,
        runFrames: r.run_frames,
        kills: r.kills,
        score: r.score,
        modifier: r.modifier,
        quotes: r.quotes,
        runs: r.runs,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
