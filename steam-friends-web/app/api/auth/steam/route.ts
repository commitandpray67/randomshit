import { NextRequest, NextResponse } from "next/server";
import { buildLoginUrl } from "@/lib/steam";
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

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return NextResponse.redirect(buildLoginUrl(appUrl, req.nextUrl.searchParams.get("next") ?? undefined));
}
