import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";

export async function POST() {
  await destroySession();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return NextResponse.redirect(`${appUrl}/`, { status: 303 });
}
