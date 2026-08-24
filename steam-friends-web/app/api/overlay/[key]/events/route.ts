import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { syncUser } from "@/lib/tracker";
import {
  getConfigByKey,
  getEventsSince,
  latestEventId,
  syncThrottleSec,
} from "@/lib/overlay";

/**
 * Feed for the OBS browser source. The overlay page polls this on the interval
 * its config sets.
 *
 * First poll (no `since`) returns the current newest event id and no events, so
 * a source that starts mid-stream doesn't dump the whole backlog on screen.
 * After that the client passes the last id it saw.
 *
 * The overlay key is the only credential here — see lib/overlay.ts.
 */
export const dynamic = "force-dynamic";

// A poll can trigger a Steam refresh, which is a handful of API calls.
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  // Flood guard. The legitimate client polls every 5-300s; this leaves plenty
  // of headroom for a source that reloads a few times while being set up.
  const rl = rateLimit(`overlay:${key}`, 60, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfter) } },
    );
  }
  const ipRl = rateLimit(`overlay-ip:${clientIp(req)}`, 120, 60);
  if (!ipRl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(ipRl.retryAfter) } },
    );
  }

  const config = await getConfigByKey(key);
  if (!config) {
    // Same response for "never existed" and "rotated away" — nothing to learn
    // from probing keys.
    return NextResponse.json(
      { ok: false, error: "unknown_overlay" },
      { status: 404, headers: NO_STORE },
    );
  }

  // Keep the overlay live: ask for a refresh, throttled in tracker.ts so only
  // one poll per window actually reaches Steam. Never let a Steam hiccup take
  // the overlay down — on failure we just serve what's already stored.
  let visibility: "ok" | "private" | "error" = "ok";
  try {
    const result = await syncUser(config.steamId, syncThrottleSec());
    if (result.status === "private") visibility = "private";
  } catch {
    visibility = "error";
  }

  const sinceParam = req.nextUrl.searchParams.get("since");

  if (sinceParam === null) {
    return NextResponse.json(
      {
        ok: true,
        lastId: await latestEventId(config.steamId),
        events: [],
        visibility,
        pollSec: config.pollSec,
      },
      { headers: NO_STORE },
    );
  }

  const since = Number(sinceParam);
  const sinceId = Number.isFinite(since) && since >= 0 ? Math.floor(since) : 0;

  const events = await getEventsSince(config, sinceId);
  const lastId = events.length ? events[events.length - 1].id : sinceId;

  return NextResponse.json(
    { ok: true, lastId, events, visibility, pollSec: config.pollSec },
    { headers: NO_STORE },
  );
}
