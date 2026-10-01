import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { studioFor, forgetStudios, isStudioSlug } from "@/lib/studios";
import { rateLimit } from "@/lib/ratelimit";
import {
  KINDS,
  type SceneElement,
  type ElementKind,
  addElement,
  updateElement,
  deleteAllElements,
  deleteElements,
  restoreElements,
  duplicateElements,
  restackElements,
  reorderElement,
  setCanvasSize,
  rotateSceneKey,
  sceneWithElements,
  toMove,
  writeMoves,
  type Move,
} from "@/lib/scene";
import { LIVE, noteElements, moveLive, motionSettled } from "@/lib/live";

/**
 * Editor mutations. A JSON endpoint rather than server actions because
 * dragging an element fires a burst of updates, and a server action would
 * revalidate the whole page on each one.
 *
 * `transform` is the drag path and is deliberately unlike the rest: no echo,
 * and the movement reaches the browser source without waiting on anything it
 * doesn't have to — from memory on the studio's own server (see lib/live.ts),
 * or in the one query that writes it on Vercel. Everything else takes the
 * slow, general route.
 *
 * Every request names its studio (`studio`, the slug in /studio/<slug>), and
 * is checked against who may edit it (lib/studios.ts) — the page render is not
 * the gate. A request naming none goes to the first studio the editor may
 * open, which is what an editor page opened before studios existed sends.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function POST(req: NextRequest) {
  const steamId = await getSession();
  if (!steamId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: NO_STORE });
  }

  // A drag pushes a transform each time the last one is answered, no more
  // often than every 33ms (DRAG_MIN_MS in the editor) — up to 30 a second on
  // the studio's own server, which answers without waiting on the database.
  // The old 600/minute ceiling cut a sustained drag off mid-move and the
  // overlay simply froze until the window rolled over. Sized to leave real
  // headroom above that cadence, with room for a second tab.
  const rl = rateLimit(`studio:${steamId}`, 4800, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400, headers: NO_STORE });
  }

  const action = String(body?.action ?? "");

  // Which canvas, and whether this editor may touch it. One answer for both:
  // a studio they can't open and one that doesn't exist look the same.
  const studio = await studioFor(steamId, isStudioSlug(body?.studio) ? body.studio : null);
  if (!studio || (body?.studio != null && !isStudioSlug(body.studio))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: NO_STORE });
  }
  const scene = { id: studio.sceneId, key: studio.sceneKey };

  // The drag fast path returns before any of the work below. Every other
  // action ends by re-reading the scene and echoing all of its elements, which
  // is the right trade for an edit you make once and a disaster for one the
  // pointer emits twenty times a second — and the editor already knows where
  // it put the element, so there is nothing to echo.
  if (action === "transform") {
    // Every element of a multi-selection in one request, so they move as one
    // rather than each trailing the last. `{ id, t }` is the older single-
    // element form, still sent by an editor opened before this changed.
    const list: any[] = Array.isArray(body.moves) ? body.moves.slice(0, 200) : [{ id: body.id, t: body.t }];
    const byId = new Map<number, Move>();
    for (const item of list) {
      const id = Number(item?.id);
      if (Number.isFinite(id)) byId.set(id, toMove(id, item?.t, body.ts));
    }
    if (byId.size === 0) {
      return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400, headers: NO_STORE });
    }
    const ref = scene;
    const moves = [...byId.values()];

    if (LIVE) {
      // Answered as soon as it's published: the write happens behind it, so
      // the editor's next position isn't held up by the database either.
      const n = await moveLive(ref, moves);
      if (n === 0) {
        return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: NO_STORE });
      }
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }

    const res = await writeMoves(ref.id, moves, null);
    if (!res) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json({ ok: true, version: res.version }, { headers: NO_STORE });
  }

  // Positions still on their way to the database land first, so this edit
  // can't be overwritten by a drag that finished before it was made.
  if (LIVE) await motionSettled();

  // Elements this request removed or created, echoed back: the editor needs the
  // removed ones to offer an undo, and the created ones to select them.
  let removed: SceneElement[] = [];
  let created: SceneElement[] = [];

  switch (action) {
    case "add": {
      const kind = String(body.kind ?? "") as ElementKind;
      if (!KINDS.includes(kind)) {
        return NextResponse.json({ ok: false, error: "bad_kind" }, { status: 400, headers: NO_STORE });
      }
      // Falls through to the shared response below so the caller gets the full
      // element list, same as every other action.
      const el = await addElement(scene.id, kind, {
        props: body.props && typeof body.props === "object" ? body.props : undefined,
        w: typeof body.w === "number" ? body.w : undefined,
        h: typeof body.h === "number" ? body.h : undefined,
      });
      noteElements(scene.id, [el.id]);
      break;
    }

    case "update": {
      const id = Number(body.id);
      if (!Number.isFinite(id)) {
        return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400, headers: NO_STORE });
      }
      // Returns early like `transform` does, for the same reason: the editor
      // applied this optimistically and has no use for the element list, so
      // re-reading the whole scene to echo it back is pure cost on a path that
      // runs once per keystroke. The version does matter — it is how the
      // editor recognises a snapshot older than its own last write.
      const version = await updateElement(scene.id, id, body.patch ?? {});
      return NextResponse.json({ ok: true, version }, { headers: NO_STORE });
    }

    case "delete": {
      // One id or many — multi-select deletes the whole selection at once.
      const ids = Array.isArray(body.ids) ? body.ids : [body.id];
      const clean = ids.map(Number).filter(Number.isFinite);
      if (clean.length === 0) {
        return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400, headers: NO_STORE });
      }
      // Handed back so the editor can offer an undo: deleting is shared and
      // irreversible otherwise, and there is no other way to get it back.
      removed = await deleteElements(scene.id, clean);
      noteElements(scene.id, [], removed.map((e) => e.id));
      break;
    }

    case "restore": {
      const list = Array.isArray(body.elements) ? body.elements : [];
      created = await restoreElements(scene.id, list);
      noteElements(scene.id, created.map((e) => e.id));
      break;
    }

    case "duplicate": {
      const ids = Array.isArray(body.ids) ? body.ids : [body.id];
      const clean = ids.map(Number).filter(Number.isFinite);
      if (clean.length === 0) {
        return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400, headers: NO_STORE });
      }
      created = await duplicateElements(scene.id, clean);
      noteElements(scene.id, created.map((e) => e.id));
      break;
    }

    case "restack": {
      const ids = Array.isArray(body.ids) ? body.ids : [body.id];
      const clean = ids.map(Number).filter(Number.isFinite);
      if (clean.length === 0) {
        return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400, headers: NO_STORE });
      }
      await restackElements(scene.id, clean, body.to === "back" ? "back" : "front");
      break;
    }

    case "clear":
      removed = await deleteAllElements(scene.id);
      noteElements(scene.id, [], removed.map((e) => e.id));
      break;

    case "reorder": {
      const id = Number(body.id);
      const dir = body.direction === "down" ? "down" : "up";
      if (!Number.isFinite(id)) {
        return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400, headers: NO_STORE });
      }
      await reorderElement(scene.id, id, dir);
      break;
    }

    case "canvas":
      await setCanvasSize(scene.id, body.w, body.h);
      break;

    case "rotate_key":
      await rotateSceneKey(scene.id);
      // The remembered studios carry the old key, which must stop working now.
      forgetStudios();
      break;

    default:
      return NextResponse.json(
        { ok: false, error: "unknown_action" },
        { status: 400, headers: NO_STORE },
      );
  }

  // Echo the resulting state so the editor stays in step without a second call.
  const fresh = await sceneWithElements({ id: scene.id });
  if (!fresh) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json(
    {
      ok: true,
      version: fresh.scene.version,
      sceneKey: fresh.scene.sceneKey,
      canvas: { w: fresh.scene.canvasW, h: fresh.scene.canvasH },
      elements: fresh.elements,
      removed,
      created,
    },
    { headers: NO_STORE },
  );
}
