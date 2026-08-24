import { NextRequest } from "next/server";
import { listenSql } from "@/lib/db";
import {
  getSceneByKey,
  getElements,
  getSceneVersion,
  sceneChannel,
  isChannelSafeKey,
} from "@/lib/scene";

/**
 * Live scene stream for the OBS browser source (Server-Sent Events).
 *
 * Changes arrive by LISTEN/NOTIFY: the writer publishes as it commits and this
 * handler forwards it, so nothing here samples the database on a timer waiting
 * to notice. That matters for dragging specifically — the previous 120ms watch
 * loop quantised every movement to its own tick, and because the editor pushes
 * on a different period the two alias against each other: some ticks carried
 * two moves, some carried none. What OBS received was an unevenly spaced
 * stream of positions, which is most of why dragging looked choppy no matter
 * how it was eased on the far end.
 *
 * A drag NOTIFY carries the new transform inline (`m`), so those frames are
 * forwarded without touching the database at all. Any other change sends just
 * a version, and the scene is re-read and sent whole.
 *
 * LISTEN needs a connection that stays on one backend, which a transaction-mode
 * pooler will not give it — and the failure is silent, not an error. So a slow
 * safety poll runs regardless, and if it ever finds a change that no
 * notification announced, this stream gives up on LISTEN and polls hot for the
 * rest of its life. Correctness never depends on the notification arriving.
 */
export const dynamic = "force-dynamic";

// Vercel caps how long a function may run. The stream closes itself just under
// the cap and EventSource reconnects on its own, so the only visible effect is
// a brief gap roughly once a minute.
export const maxDuration = 60;
const CLOSE_AFTER_MS = 50_000;

// The loop only wakes to check flags and the clock; it does no database work
// unless something told it to.
const TICK_MS = 60;
// Backstop against a NOTIFY that never arrives. Cheap: one indexed read a
// second, against the eight a second the old watch loop did.
const POLL_SAFE_MS = 1000;
// What we drop back to once LISTEN is shown not to be delivering.
const POLL_HOT_MS = 120;
const KEEPALIVE_MS = 15_000;

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

      let unlisten: (() => Promise<void>) | null = null;

      const finish = () => {
        if (closed) return;
        closed = true;
        void unlisten?.().catch(() => {});
        try {
          controller.close();
        } catch {
          /* already closed by the client going away */
        }
      };

      // The client disconnecting (OBS closing the source) aborts the request.
      req.signal.addEventListener("abort", finish);

      send("hello", {});

      let lastVersion = Number.isFinite(since) ? since : 0;
      let lastBeat = Date.now();
      const startedAt = Date.now();

      // Set when a notification says the scene changed but doesn't carry the
      // change itself; the loop picks it up on its next tick.
      let dirty = false;
      let notifications = 0;
      let listening = false;
      let hot = false;

      const pushFull = async () => {
        const fresh = await getSceneByKey(key);
        if (!fresh) {
          send("bye", { reason: "deleted" });
          finish();
          return;
        }
        const elements = await getElements(fresh.id);
        lastVersion = fresh.version;
        send("scene", {
          version: fresh.version,
          canvas: { w: fresh.canvasW, h: fresh.canvasH },
          elements: elements.filter((e) => !e.hidden),
        });
      };

      // Subscribe before the first read, so a change landing between the two
      // is queued rather than missed.
      if (isChannelSafeKey(key)) {
        try {
          const sub = await listenSql.listen(sceneChannel(key), (raw) => {
            if (closed) return;
            notifications++;
            try {
              const d = JSON.parse(raw);
              if (Array.isArray(d.m)) {
                // A movement, complete in the payload — straight through.
                if (typeof d.v === "number") lastVersion = d.v;
                send("motion", d);
              } else {
                dirty = true;
              }
            } catch {
              dirty = true;
            }
          });
          unlisten = sub.unlisten;
          listening = true;
        } catch {
          // No listening connection available (a pooled URL, most likely).
          // Polling covers it.
          hot = true;
        }
      } else {
        hot = true;
      }

      // Send the current state immediately when the client is behind, so a
      // reconnect never leaves a stale scene on screen.
      try {
        if (scene.version !== lastVersion) await pushFull();
      } catch {
        /* fall through to the loop */
      }

      let nextPollAt = Date.now() + (hot ? POLL_HOT_MS : POLL_SAFE_MS);

      while (!closed) {
        await new Promise((r) => setTimeout(r, TICK_MS));
        if (closed) break;

        if (Date.now() - startedAt > CLOSE_AFTER_MS) {
          send("bye", { reason: "rotate" });
          finish();
          break;
        }

        try {
          if (dirty) {
            dirty = false;
            await pushFull();
          }

          if (Date.now() >= nextPollAt) {
            const version = await getSceneVersion(key);
            if (version === null) {
              send("bye", { reason: "deleted" });
              finish();
              break;
            }
            if (version !== lastVersion) {
              // A change nothing told us about. If we believe we're listening,
              // we aren't really — some pooler is swallowing it — so stop
              // trusting notifications from here on.
              if (listening && notifications === 0) {
                listening = false;
                hot = true;
              }
              await pushFull();
            }
            nextPollAt = Date.now() + (hot ? POLL_HOT_MS : POLL_SAFE_MS);
          }

          if (Date.now() - lastBeat > KEEPALIVE_MS) {
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
