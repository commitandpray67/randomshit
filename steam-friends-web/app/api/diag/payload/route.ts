import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

/**
 * Serves an exact number of kilobytes, for detecting a connection that
 * truncates responses.
 *
 * Russian ISPs have been capping throttled connections at ~16KB of content,
 * which shows up as a page that half-loads rather than one that fails cleanly.
 * Asking for known sizes and comparing what actually arrives finds the cliff.
 *
 * The body is random hex rather than repeated filler: compression would shrink
 * repetitive data to nothing and hide the very limit we're measuring.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const kb = Math.min(512, Math.max(1, Number(req.nextUrl.searchParams.get("kb") ?? 16)));
  const bytes = kb * 1024;
  const body = crypto.randomBytes(Math.ceil(bytes / 2)).toString("hex").slice(0, bytes);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": String(bytes),
      "Cache-Control": "no-store, no-transform",
      "X-Expected-Bytes": String(bytes),
    },
  });
}
