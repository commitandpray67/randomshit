import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { syncUser } from "@/lib/tracker";

// The daily poll. A scheduler (Vercel Cron, GitHub Actions, etc.) calls this
// with `Authorization: Bearer <CRON_SECRET>`. It snapshots every user so
// unfriends are detected even when nobody is on the site.
//
// Give it room to run — many users means many Steam calls.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const users = await sql`SELECT steam_id FROM users`;
  const summary: Record<string, unknown>[] = [];

  for (const u of users) {
    try {
      const result = await syncUser(u.steam_id);
      summary.push({ steamId: u.steam_id, ...result });
    } catch (e: any) {
      summary.push({ steamId: u.steam_id, status: "error", message: String(e?.message ?? e) });
    }
    // Be gentle with Steam's rate limits between users.
    await new Promise((r) => setTimeout(r, 250));
  }

  return NextResponse.json({ polled: users.length, results: summary });
}
