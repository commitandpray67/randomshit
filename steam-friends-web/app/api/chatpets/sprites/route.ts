import { NextRequest, NextResponse } from "next/server";
import { spritesForChannel } from "@/lib/petsprites";

/**
 * The uploaded sprites that apply in one streamer's chat, for the pets page
 * (app/chatpets/route.ts), which asks on load and then every minute — that's
 * how an upload reaches OBS without a rebuild or a refresh.
 *
 * No login: the pets page runs in OBS. Nothing here is private either; it's
 * which chatters have which pet, and that's on stream for anyone to see.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const channel = (req.nextUrl.searchParams.get("channel") ?? "").toLowerCase();
  if (!/^[a-z0-9_]{1,25}$/.test(channel)) {
    return NextResponse.json(
      { ok: true, mix: [], chatters: {} },
      { headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } },
    );
  }
  const data = await spritesForChannel(channel);
  return NextResponse.json(
    { ok: true, ...data },
    // A little caching takes the edge off many sources asking at once, and is
    // well inside the minute the page waits between asks anyway.
    // Any origin: the pets page runs in a sandboxed frame, which has none of
    // its own, so to the browser even this site counts as another one.
    { headers: { "Cache-Control": "public, max-age=15", "Access-Control-Allow-Origin": "*" } },
  );
}
