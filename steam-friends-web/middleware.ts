import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "lang";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const path = request.nextUrl.pathname;

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
  // `jayc` likewise: it is a static game canvas with its own text, and the
  // audio beside it is megabytes that gain nothing from a Set-Cookie.
  // `toy` (the seating planner) has its own login and no localized text.
  // `chatpets` is framed inside the browser source, same as `scene`.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|sitemap.xml|robots.txt|ads.txt|opengraph-image|overlay|scene|lite|chatpets|studio|diag|jayc|toy|api/).*)",
  ],
};
