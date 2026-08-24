import { NextRequest } from "next/server";
import { getSceneByKey, getElements, getSceneVersion } from "@/lib/scene";

/**
 * Live scene stream for the OBS browser source (Server-Sent Events).
 *
 * Replaces once-a-second polling. The browser source holds one connection and
 * the server watches the version column, pushing only when something actually
 * changes — so edits reach OBS in a fraction of a second instead of up to a
 * second, and an idle overlay makes no HTTP requests at all rather than 3,600
 * an hour.
 *
 * Polling stays as the client's fallback; see SceneStage.
 */
export const dynamic = "force-dynamic";

// Vercel caps how long a function may run. The stream closes itself just under
// the cap and EventSource reconnects on its own, so the only visible effect is
// a brief gap roughly once a minute.
export const maxDuration = 60;
const CLOSE_AFTER_MS = 50_000;

// How often the server checks the version. This is a tiny indexed read, and it
// runs inside the region next to the database rather than across the network
// from the streamer.
const HOT_MS = 120;
// Once nothing has changed for a while, ease off — an overlay that sits still
// for a whole broadcast shouldn't keep the database compute hot at 8 reads a
// second. Any change snaps it straight back to HOT_MS.
const IDLE_MS = 1000;
const IDLE_AFTER_MS = 20_000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const scene = await getSceneByKey(key);
  if (!scene) {
    return new Response("unknown scene", { status: 404 });
  }

  const since = Number(req.nextUrl.searchParams.get("v") ?? "0");
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const finish = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed by the client going away */
        }
      };

      // The client disconnecting (OBS closing the source) aborts the request.
      req.signal.addEventListener("abort", finish);

      // Tell the client how long to ease between updates, so its interpolation
      // matches the cadence it will actually receive.
      send("hello", { smoothMs: HOT_MS });

      let lastVersion = Number.isFinite(since) ? since : 0;
      let lastChangeAt = Date.now();
      const startedAt = Date.now();

      // Send the current state immediately when the client is behind, so a
      // reconnect never leaves a stale scene on screen.
      try {
        if (scene.version !== lastVersion) {
          const elements = await getElements(scene.id);
          lastVersion = scene.version;
          send("scene", {
            version: scene.version,
            canvas: { w: scene.canvasW, h: scene.canvasH },
            elements: elements.filter((e) => !e.hidden),
          });
        }
      } catch {
        /* fall through to the watch loop */
      }

      let lastBeat = Date.now();

      while (!closed) {
        if (Date.now() - startedAt > CLOSE_AFTER_MS) {
          send("bye", { reason: "rotate" });
          finish();
          break;
        }

        const idle = Date.now() - lastChangeAt > IDLE_AFTER_MS;
        await new Promise((r) => setTimeout(r, idle ? IDLE_MS : HOT_MS));
        if (closed) break;

        try {
          const version = await getSceneVersion(key);
          if (version === null) {
            send("bye", { reason: "deleted" });
            finish();
            break;
          }
          if (version !== lastVersion) {
            lastVersion = version;
            lastChangeAt = Date.now();
            const fresh = await getSceneByKey(key);
            if (fresh) {
              const elements = await getElements(fresh.id);
              send("scene", {
                version,
                canvas: { w: fresh.canvasW, h: fresh.canvasH },
                elements: elements.filter((e) => !e.hidden),
              });
            }
          } else if (Date.now() - lastBeat > 15_000) {
            // A comment frame keeps proxies from dropping an idle connection.
            lastBeat = Date.now();
            if (!closed) {
              try {
                controller.enqueue(encoder.encode(`: keepalive\n\n`));
              } catch {
                closed = true;
              }
            }
          }
        } catch {
          // A transient database error shouldn't kill the stream; the next
          // tick retries, and a persistent failure ends with the duration cap.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Nginx-style proxies buffer streamed responses without this.
      "X-Accel-Buffering": "no",
    },
  });
}
