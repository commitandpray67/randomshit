import { NextRequest, NextResponse } from "next/server";
import { verifyLogin, getPlayerSummaries, safeNext } from "@/lib/steam";
import { createSession } from "@/lib/session";
import { sql } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/ratelimit";

// GET /api/auth/steam/return → Steam redirects here after login.
export async function GET(req: NextRequest) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

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

  await sql`
    INSERT INTO users (steam_id, display_name, avatar)
    VALUES (${steamId}, ${displayName}, ${avatar})
    ON CONFLICT (steam_id) DO UPDATE SET
      display_name = COALESCE(EXCLUDED.display_name, users.display_name),
      avatar = COALESCE(EXCLUDED.avatar, users.avatar)
  `;

  await createSession(steamId);
  // Re-checked here rather than trusted: this is the request's own query
  // string, which is not what Steam signed.
  return NextResponse.redirect(`${appUrl}${safeNext(query.get("next"))}`);
}
