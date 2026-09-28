import { NextRequest } from "next/server";
import { acquireListener, releaseListener } from "@/lib/db";
import {
  getSceneByKey,
  getSceneVersion,
  sceneWithElements,
  sceneChannel,
  isChannelSafeKey,
} from "@/lib/scene";
import { LIVE, ORIGIN, subscribe, withLiveMoves } from "@/lib/live";

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
 * A drag NOTIFY carries the new transforms inline (`ms`), so those frames are
 * forwarded without touching the database at all. Any other change sends just
 * a version, and the scene is re-read and sent whole.
 *
 * On the studio's own server, drags don't wait for the NOTIFY either: they
 * arrive from memory the moment an editor sends them (lib/live.ts), and the
 * NOTIFY that follows from this same process is used only for its version.
 *
 * Hidden elements are sent too. The renderer drops them (see ElementBox), and
 * the studio is on the other end of this same stream — filtering them out here
 * would make hiding something delete it from every editor's layer list.
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
// a brief gap roughly once a minute. A server of our own has no cap, and every
// reconnect is a moment a drag can fall into, so there it stays open far
// longer.
export const maxDuration = 60;
const CLOSE_AFTER_MS = LIVE ? 10 * 60_000 : 50_000;

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
      let holding = false;
      let unsubscribe: (() => void) | null = null;

      /**
       * Drop the subscription and hand the listening connection back — once,
       * however the stream ended.
       *
       * Separate from `finish` because not every ending goes through it: a
       * write to a client that has already gone sets `closed` directly, and
       * `finish` then returns early. Tying the cleanup to `finish` alone left
       * those streams subscribed for good, which on a long-running server is a
       * connection that never closes.
       */
      const letGo = () => {
        unsubscribe?.();
        unsubscribe = null;
        const u = unlisten;
        unlisten = null;
        if (u) void u().catch(() => {});
        if (holding) {
          holding = false;
          releaseListener();
        }
      };

      const finish = () => {
        letGo();
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
        const fresh = await sceneWithElements({ key });
        if (!fresh) {
          send("bye", { reason: "deleted" });
          finish();
          return;
        }
        const { scene: sc, elements } = fresh;
        lastVersion = Math.max(lastVersion, sc.version);
        send("scene", {
          version: sc.version,
          canvas: { w: sc.canvasW, h: sc.canvasH },
          // Positions already sent live but not in this read yet; without them
          // a snapshot taken mid-drag would pull elements back.
          elements: withLiveMoves(sc.version, elements),
        });
      };

      // Movements from editors on this same server, straight from memory.
      // Subscribed before the first read, like LISTEN, so nothing falls between.
      if (LIVE) {
        unsubscribe = subscribe(key, (e) => {
          if (closed) return;
          if (e.type === "motion") {
            send("motion", { ts: e.ts, m: e.m });
          } else if (e.v > lastVersion) {
            // No movement in it, just the version the database has reached, so
            // a reconnect knows it is up to date and doesn't re-read the scene.
            lastVersion = e.v;
            send("motion", { v: e.v });
          }
        });
      }

      // Subscribe before the first read, so a change landing between the two
      // is queued rather than missed.
      if (isChannelSafeKey(key)) {
        try {
          const client = acquireListener();
          holding = true;
          const sub = await client.listen(sceneChannel(key), (raw) => {
            if (closed) return;
            notifications++;
            try {
              const d = JSON.parse(raw);
              if (LIVE && d.o === ORIGIN) {
                // Written by this process, whose streams already had it from
                // memory; only the version is news, and the bus brings that.
                return;
              }
              if (Array.isArray(d.ms)) {
                // Movements, complete in the payload — straight through, one
                // frame per element. Only the last carries the version: the
                // receiving end drops a frame whose version it has already
                // seen, which would otherwise be all but the first of these.
                const rows = d.ms as number[][];
                rows.forEach((row, i) => {
                  const frame: Record<string, unknown> = { ts: row[6] ?? null, m: row.slice(0, 6) };
                  if (i === rows.length - 1 && typeof d.v === "number") frame.v = d.v;
                  send("motion", frame);
                });
                if (typeof d.v === "number") lastVersion = Math.max(lastVersion, d.v);
              } else if (Array.isArray(d.m)) {
                // The single-element form, from a server not yet updated.
                if (typeof d.v === "number") lastVersion = d.v;
                send("motion", d);
              } else {
                dirty = true;
              }
            } catch {
              dirty = true;
            }
          });
          if (closed) {
            // The client left while LISTEN was still being set up, and letGo
            // has already run — so this subscription is nobody's to undo.
            void sub.unlisten().catch(() => {});
          } else {
            unlisten = sub.unlisten;
            listening = true;
          }
        } catch {
          // No listening connection available (a pooled URL, most likely).
          // Polling covers it.
          hot = true;
          letGo();
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

      // Whatever ended the loop, the subscription ends with it.
      letGo();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Nginx-style proxies buffer streamed responses without this.
      "X-Accel-Buffering": "no",
      // Same as the scene feed: the key is the credential, no cookie is read.
      "Access-Control-Allow-Origin": "*",
    },
  });
}
