import { NextResponse } from "next/server";

/**
 * A short SSE stream that exists only to be measured.
 *
 * The overlay's live updates ride on Server-Sent Events, so "can this
 * connection stream?" is a question worth answering directly. Pointing the
 * check at the real scene stream with a made-up key does not answer it: that
 * 404s, and `EventSource` reports a 404 and a connection nothing ever reached
 * as the same `onerror`. A blocked stream would come back looking fine, which
 * is the one result a diagnostic must never give.
 *
 * So this streams for real. Frames go out spaced apart and carry a running
 * byte count, which separates the three outcomes that matter:
 *
 *   - frames arriving one after another   → streaming works
 *   - opens, then silence                 → something in between is buffering
 *   - nothing at all                      → the connection can't reach us
 *
 * The running total also catches a stream that dies partway, which is the same
 * truncation the payload endpoint looks for, measured on the transport the
 * overlay actually depends on.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const FRAMES = 6;
const GAP_MS = 350;
/** Padding per frame, so the total is big enough to cross a small cap. */
const PAD = 2048;

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let sent = 0;
      try {
        for (let i = 1; i <= FRAMES; i++) {
          const payload = JSON.stringify({
            frame: i,
            of: FRAMES,
            sent,
            at: Date.now(),
            // Filler, so a connection with a byte ceiling hits it here too.
            pad: "x".repeat(PAD),
          });
          const chunk = `event: probe\ndata: ${payload}\n\n`;
          sent += chunk.length;
          controller.enqueue(encoder.encode(chunk));
          if (i < FRAMES) await new Promise((r) => setTimeout(r, GAP_MS));
        }
        controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ sent })}\n\n`));
      } catch {
        /* the client went away mid-stream */
      }
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Without this an nginx-style proxy buffers the whole stream and the
      // test would blame the connection for the server's own buffering.
      "X-Accel-Buffering": "no",
    },
  });
}
