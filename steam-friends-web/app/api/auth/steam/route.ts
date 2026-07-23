import { NextResponse } from "next/server";
import { buildLoginUrl } from "@/lib/steam";

// GET /api/auth/steam → bounce the user to Steam's sign-in page.
export async function GET() {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return NextResponse.redirect(buildLoginUrl(appUrl));
}
