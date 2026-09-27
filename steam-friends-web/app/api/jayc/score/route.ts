import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { parseRun } from "@/lib/jayc";

// POST /api/jayc/score → record a completed run for the signed-in player.
//
// Same-origin only: the game is served from /jayc, so the session cookie rides
// along on a plain fetch and there is no CORS header here on purpose. A run is
// kept only if it beats the player's stored time, but every clear bumps `runs`.
export async function POST(req: NextRequest) {
  const steamId = await getSession();
  if (!steamId) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  // Burst protection. A real player finishes a seven-floor run every few
  // minutes at best, so this is generous and still stops a submit loop.
  const rl = rateLimit(`jayc-score:${steamId}`, 20, 300);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "too many submissions" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }
  const ipRl = rateLimit(`jayc-score-ip:${clientIp(req)}`, 60, 300);
  if (!ipRl.ok) {
    return NextResponse.json({ error: "too many submissions" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad JSON" }, { status: 400 });
  }

  const parsed = parseRun(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const run = parsed.run;

  // The row references users(steam_id), which exists because a session cookie
  // is only ever issued after the login route upserts the player.
  const rows = await sql`
    INSERT INTO jayc_scores (
      steam_id, run_frames, kills, score, modifier, quotes, achievements
    )
    VALUES (
      ${steamId}, ${run.runFrames}, ${run.kills}, ${run.score},
      ${run.modifier}, ${run.quotes}, ${run.achievements}
    )
    ON CONFLICT (steam_id) DO UPDATE SET
      -- Only a faster clear replaces the recorded run.
      run_frames   = LEAST(jayc_scores.run_frames, EXCLUDED.run_frames),
      kills        = CASE WHEN EXCLUDED.run_frames < jayc_scores.run_frames
                          THEN EXCLUDED.kills ELSE jayc_scores.kills END,
      score        = CASE WHEN EXCLUDED.run_frames < jayc_scores.run_frames
                          THEN EXCLUDED.score ELSE jayc_scores.score END,
      modifier     = CASE WHEN EXCLUDED.run_frames < jayc_scores.run_frames
                          THEN EXCLUDED.modifier ELSE jayc_scores.modifier END,
      -- Collections only ever grow, so keep the high-water mark either way.
      quotes       = GREATEST(jayc_scores.quotes, EXCLUDED.quotes),
      achievements = GREATEST(jayc_scores.achievements, EXCLUDED.achievements),
      runs         = jayc_scores.runs + 1,
      updated_at   = now()
    RETURNING run_frames, runs
  `;

  const row = rows[0];
  return NextResponse.json({
    ok: true,
    bestFrames: row.run_frames,
    // The stored time is the submitted one exactly when this run is the best
    // the player has — true on a first clear and on an improvement alike.
    improved: row.run_frames === run.runFrames,
    runs: row.runs,
  });
}
