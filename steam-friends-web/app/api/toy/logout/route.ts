import { NextResponse } from "next/server";
import { endToySession } from "@/lib/toy";

// POST /api/toy/logout → forgets the planner cookie on this browser.
export async function POST() {
  await endToySession();
  return NextResponse.json({ ok: true });
}
