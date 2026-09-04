/**
 * Shared rules for the JayC leaderboard.
 *
 * A browser game cannot prove its own score: the run is simulated on the
 * player's machine and the submission is a plain fetch anyone can forge from
 * devtools. Nothing below changes that. These are shape checks — they reject
 * numbers that no real run could produce, which stops casual nonsense and
 * accidental garbage, and they keep the table clean. The real backstop is
 * that every row is tied to a verified SteamID and can be hidden.
 */

/** The game ticks a fixed 60fps step and counts run length in frames. */
export const FPS = 60;

/**
 * Floor on a full seven-floor clear. Set deliberately low so a genuinely
 * excellent speedrun is never rejected — it only catches "0 seconds" claims.
 */
export const MIN_RUN_FRAMES = 3 * 60 * FPS; // 3 minutes

/** Ceiling, mostly so an idle tab left running overnight can't post a time. */
export const MAX_RUN_FRAMES = 3 * 60 * 60 * FPS; // 3 hours

/** You cannot reach the throne without fighting through the floors. */
export const MIN_KILLS = 50;
export const MAX_KILLS = 20000;
export const MAX_SCORE = 2_000_000;

/** 42 findable quotes; the cap is generous in case more are added later. */
export const MAX_QUOTES = 200;
export const MAX_ACHIEVEMENTS = 200;

export const MODIFIERS = ["clutch", "caring", "catty", "l", "none"] as const;
export type Modifier = (typeof MODIFIERS)[number];

export type RunSubmission = {
  runFrames: number;
  kills: number;
  score: number;
  modifier: Modifier;
  quotes: number;
  achievements: number;
};

function isCount(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

/**
 * Validate a submitted run. Returns the cleaned run, or a reason string
 * describing the first thing that was wrong.
 */
export function parseRun(body: unknown): { run: RunSubmission } | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "Body must be an object" };
  const b = body as Record<string, unknown>;

  if (!isCount(b.runFrames, MIN_RUN_FRAMES, MAX_RUN_FRAMES)) {
    return { error: "Implausible run length" };
  }
  if (!isCount(b.kills, MIN_KILLS, MAX_KILLS)) return { error: "Implausible kill count" };
  if (!isCount(b.score, 0, MAX_SCORE)) return { error: "Implausible score" };
  if (!isCount(b.quotes, 0, MAX_QUOTES)) return { error: "Implausible quote count" };
  if (!isCount(b.achievements, 0, MAX_ACHIEVEMENTS)) {
    return { error: "Implausible achievement count" };
  }

  const modifier = typeof b.modifier === "string" ? b.modifier : "none";
  if (!(MODIFIERS as readonly string[]).includes(modifier)) {
    return { error: "Unknown C modifier" };
  }

  return {
    run: {
      runFrames: b.runFrames,
      kills: b.kills,
      score: b.score,
      modifier: modifier as Modifier,
      quotes: b.quotes,
      achievements: b.achievements,
    },
  };
}
