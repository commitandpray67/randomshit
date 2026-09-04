import { NextRequest, NextResponse } from "next/server";
import { currentOrigin } from "@/lib/apphost";
import { verifyLogin, getPlayerSummaries } from "@/lib/steam";
import { createSession } from "@/lib/session";
import { sql } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/ratelimit";

// GET /api/auth/steam/return → Steam redirects here after login.
export async function GET(req: NextRequest) {
  const appUrl = await currentOrigin(req.headers);

  // Burst protection: this endpoint verifies with Steam and writes to the DB.
  const rl = rateLimit(`login-return:${clientIp(req)}`, 15, 60);
  if (!rl.ok) {
    return new NextResponse("Too many requests. Try again shortly.", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfter) },
    });
  }

  const query = req.nextUrl.searchParams;
  const steamId = await verifyLogin(query);


  if (!steamId) {
    return NextResponse.redirect(`${appUrl}/?error=auth`);
  }

  // Upsert the user with a fresh profile snapshot.
  let displayName: string | null = null;
  let avatar: string | null = null;
  try {
    const summaries = await getPlayerSummaries([steamId]);
    const me = summaries.get(steamId);
    displayName = me?.personaname ?? null;
    avatar = me?.avatar ?? null;
  } catch {
    // Non-fatal, we can still log the user in without their display name.
  }

  // Someone arriving from the game only wants a leaderboard identity, so their
  // new row opts out of the daily Steam poll. On conflict the column is left
  // alone: an existing tracker user signing in via the game keeps tracking, and
  // syncUser() opts a game player in the moment they use the dashboard.
  const fromGame = req.cookies.get("sfw_after")?.value === "jayc";

  await sql`
    INSERT INTO users (steam_id, display_name, avatar, tracker_opt_in)
    VALUES (${steamId}, ${displayName}, ${avatar}, ${!fromGame})
    ON CONFLICT (steam_id) DO UPDATE SET
      display_name = COALESCE(EXCLUDED.display_name, users.display_name),
      avatar = COALESCE(EXCLUDED.avatar, users.avatar)
  `;

  await createSession(steamId);

  const res = NextResponse.redirect(`${appUrl}${fromGame ? "/jayc" : "/dashboard"}`);
  if (fromGame) res.cookies.delete("sfw_after");
  return res;
}
