import { NextRequest, NextResponse } from "next/server";
import { LOCALES, type Locale } from "@/lib/i18n";

const MAX_AGE = 60 * 60 * 24 * 365;

export function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang") as Locale | null;
  const returnTo = req.nextUrl.searchParams.get("return") ?? "/";

  const dest = new URL(returnTo, req.url);
  const res = NextResponse.redirect(dest);

  if (lang && LOCALES.includes(lang)) {
    res.cookies.set("lang", lang, { path: "/", maxAge: MAX_AGE, sameSite: "lax" });
  }

  return res;
}
