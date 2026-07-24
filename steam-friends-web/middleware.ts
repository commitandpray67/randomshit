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

  // First visit (no cookie) — auto-detect from Accept-Language.
  if (!request.cookies.has(COOKIE)) {
    const al = (request.headers.get("accept-language") ?? "").toLowerCase();
    if (al.includes("ru")) {
      response.cookies.set(COOKIE, "ru", { path: "/", maxAge: MAX_AGE, sameSite: "lax" });
    } else if (/zh|cn/.test(al)) {
      response.cookies.set(COOKIE, "zh", { path: "/", maxAge: MAX_AGE, sameSite: "lax" });
    } else if (al.includes("tr")) {
      response.cookies.set(COOKIE, "tr", { path: "/", maxAge: MAX_AGE, sameSite: "lax" });
    }
    // en is the default — no cookie needed; getLocale() falls back to en.
  }

  return response;
}

export const config = {
  // Run on all routes except Next.js internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
