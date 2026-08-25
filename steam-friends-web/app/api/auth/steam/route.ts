import { NextRequest, NextResponse } from "next/server";
import { buildLoginUrl } from "@/lib/steam";
import { currentOrigin } from "@/lib/apphost";
import { rateLimit, clientIp } from "@/lib/ratelimit";

// GET /api/auth/steam → bounce the user to Steam's sign-in page.
export async function GET(req: NextRequest) {
  const rl = rateLimit(`login-start:${clientIp(req)}`, 30, 60);
  if (!rl.ok) {
    return new NextResponse("Too many requests. Try again shortly.", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfter) },
    });
  }

  // Return to whichever hostname the user reached us on, so someone who
  // cannot load the canonical domain still ends up signed in where they are.
  const appUrl = await currentOrigin(req.headers);
  return NextResponse.redirect(buildLoginUrl(appUrl));
}
