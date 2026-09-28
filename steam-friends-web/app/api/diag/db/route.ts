import { NextRequest, NextResponse } from "next/server";
import { studioSql as sql } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/ratelimit";

/**
 * How long this server takes to reach its database.
 *
 * With the studio on its own host, the database is no longer next door: Neon
 * stays where it was and the VPS reaches it across the internet on every
 * save. When the studio feels slow but /diag's download checks are clean,
 * this is the link to look at — and running /diag on both hosts compares
 * Vercel's distance to the database with the VPS's.
 *
 * Public, like the rest of /diag, so it is rate-limited and reports nothing
 * about the database beyond timings: a connection error can name hosts.
 *
 * It times the database the studio uses — the one saves wait on. On a studio
 * server with its own (STUDIO_DATABASE_URL) that's the local one, and timing it
 * doesn't wake Neon; everywhere else it's the same database as the rest.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const ROUNDS = 5;

export async function GET(req: NextRequest) {
  const rl = rateLimit(`diag-db:${clientIp(req)}`, 10, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfter) } },
    );
  }

  const times: number[] = [];
  try {
    for (let i = 0; i < ROUNDS; i++) {
      const t = performance.now();
      await sql`select 1`;
      times.push(Math.round(performance.now() - t));
    }
  } catch {
    return NextResponse.json({ ok: false, error: "database unreachable" }, { status: 502, headers: NO_STORE });
  }

  // The first round may include opening a connection — idle ones are closed
  // after 20s so Neon can suspend — so it's reported apart from the rest.
  const warm = times.slice(1).sort((a, b) => a - b);
  return NextResponse.json(
    { ok: true, first: times[0], median: warm[Math.floor(warm.length / 2)], all: times },
    { headers: NO_STORE },
  );
}
