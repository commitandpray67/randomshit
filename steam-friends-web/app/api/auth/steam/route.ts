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
  const res = NextResponse.redirect(buildLoginUrl(appUrl));

  // Where to land after Steam bounces back. Carried in a short-lived cookie
  // rather than in openid.return_to, so the signed OpenID round trip stays
  // byte-for-byte what it is today. Only a fixed set of names is accepted, so
  // this can never become an open redirect.
  if (req.nextUrl.searchParams.get("to") === "jayc") {
    res.cookies.set("sfw_after", "jayc", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  }

  return res;
}
