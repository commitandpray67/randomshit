import { NextResponse } from "next/server";
import { currentOrigin } from "@/lib/apphost";
import { destroySession } from "@/lib/session";

export async function POST() {
  await destroySession();
  const appUrl = await currentOrigin();
  return NextResponse.redirect(`${appUrl}/`, { status: 303 });
}
