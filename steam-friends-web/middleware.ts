import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkSession } from "@/lib/session-edge";

const COOKIE = "lang";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const path = request.nextUrl.pathname;

  // The game at /jayc is behind Steam sign-in. Handled first and returned
  // early: it is a static canvas with its own text, so there is no locale to
  // pick and no reason to put a Set-Cookie on it or on the audio beside it.
  if (path === "/jayc" || path.startsWith("/jayc/")) {
    const session = await checkSession(request);
    if (session.status === "ok") return response;
    if (session.status === "misconfigured") {
      // Bouncing to Steam here would loop forever: the login would mint a
      // cookie this deployment still cannot verify. Say so instead.
      return new NextResponse(
        "The game is unavailable: this deployment has no SESSION_SECRET, so sign-in cannot be verified.",
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    const to = new URL("/api/auth/steam", request.url);
    to.searchParams.set("to", "jayc");
    return NextResponse.redirect(to);
  }

  // Visiting a locale page always wins — stamp the matching cookie.
  if (path === "/ru" || path.startsWith("/ru/")) {
    response.cookies.set(COOKIE, "ru", { path: "/", maxAge: MAX_AGE, sameSite: "lax" });
    return response;
  }
  if (path === "/zh" || path.startsWith("/zh/")) {
    response.cookies.set(COOKIE, "zh", { path: "/", maxAge: MAX_AGE, sameSite: "lax" });
    return response;
  }
  if (path === "/tr" || path.startsWith("/tr/")) {
    response.cookies.set(COOKIE, "tr", { path: "/", maxAge: MAX_AGE, sameSite: "lax" });
    return response;
  }
  if (path === "/es" || path.startsWith("/es/")) {
    response.cookies.set(COOKIE, "es", { path: "/", maxAge: MAX_AGE, sameSite: "lax" });
    return response;
  }

  // First visit (no cookie) — auto-detect from Accept-Language.
  if (!request.cookies.has(COOKIE)) {
    const al = (request.headers.get("accept-language") ?? "").toLowerCase();
    if (al.includes("ru")) {
      response.cookies.set(COOKIE, "ru", { path: "/", maxAge: MAX_AGE, sameSite: "lax" });
    } else if (/zh|cn/.test(al)) {
      response.cookies.set(COOKIE, "zh", { path: "/", maxAge: MAX_AGE, sameSite: "lax" });
    } else if (al.includes("tr")) {
      response.cookies.set(COOKIE, "tr", { path: "/", maxAge: MAX_AGE, sameSite: "lax" });
    } else if (al.includes("es")) {
      response.cookies.set(COOKIE, "es", { path: "/", maxAge: MAX_AGE, sameSite: "lax" });
    }
    // en is the default — no cookie needed; getLocale() falls back to en.
  }

  return response;
}

export const config = {
  // Run on page routes only. Crawler-facing files (sitemap, robots, ads.txt)
  // and static assets are excluded so they are served without a Set-Cookie
  // and without any locale handling.
  // `overlay` is excluded too: the OBS browser source has no user and no
  // language to pick, and a Set-Cookie on it would do nothing but churn.
  //
  // `jayc` is deliberately NOT excluded any more: the sign-in gate above has
  // to see those requests. It returns before any locale handling, so the game
  // still gets no language cookie.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|sitemap.xml|robots.txt|ads.txt|opengraph-image|overlay|scene|lite|studio|diag|api/).*)",
  ],
};
