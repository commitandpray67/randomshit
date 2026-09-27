import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isOverlayAllowed } from "@/lib/overlay";
import { rateLimit } from "@/lib/ratelimit";
import {
  KINDS,
  type SceneElement,
  type ElementKind,
  studioScene,
  addElement,
  updateElement,
  deleteAllElements,
  deleteElements,
  restoreElements,
  duplicateElements,
  restackElements,
  reorderElement,
  applyTransform,
  setCanvasSize,
  rotateSceneKey,
  getElements,
} from "@/lib/scene";

/**
 * Editor mutations. A JSON endpoint rather than server actions because
 * dragging an element fires a burst of updates, and a server action would
 * revalidate the whole page on each one.
 *
 * `transform` is the drag path and is deliberately unlike the rest: one query,
 * no echo, and it publishes the movement to the browser source as it commits.
 * Everything else takes the slow, general route.
 *
 * Gated by the same POGLY_ALLOWED_STEAM_IDS allowlist as the studio page, and
 * re-checked here — the page render is not the gate.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function POST(req: NextRequest) {
  const steamId = await getSession();
  if (!steamId || !isOverlayAllowed(steamId)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: NO_STORE });
  }

  // A drag pushes about 20 transforms a second (see DRAG_PUSH_MS in the
  // editor), so the old 600/minute ceiling cut a sustained drag off mid-move
  // and the overlay simply froze until the window rolled over. Sized to leave
  // real headroom above the editor's own cadence.
  const rl = rateLimit(`studio:${steamId}`, 2400, 60);
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

  // The drag fast path returns before any of the work below. Every other
  // action ends by re-reading the scene and echoing all of its elements, which
  // is the right trade for an edit you make once and a disaster for one the
  // pointer emits twenty times a second: `applyTransform` is a single query,
  // it publishes the movement to the browser source itself, and the editor
  // already knows where it put the element, so there is nothing to echo.
  if (action === "transform") {
    const id = Number(body.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400, headers: NO_STORE });
    }
    const version = await applyTransform(steamId, id, body.t ?? {}, body.ts);
    if (version === null) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json({ ok: true, version }, { headers: NO_STORE });
  }

  // Everyone on the allowlist edits the same canvas; see studioOwner.
  const scene = await studioScene(steamId);
  const owner = scene.steamId;

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
      await addElement(scene.id, kind, {
        props: body.props && typeof body.props === "object" ? body.props : undefined,
        w: typeof body.w === "number" ? body.w : undefined,
        h: typeof body.h === "number" ? body.h : undefined,
      });
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
      break;
    }

    case "restore": {
      const list = Array.isArray(body.elements) ? body.elements : [];
      created = await restoreElements(scene.id, list);
      break;
    }

    case "duplicate": {
      const ids = Array.isArray(body.ids) ? body.ids : [body.id];
      const clean = ids.map(Number).filter(Number.isFinite);
      if (clean.length === 0) {
        return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400, headers: NO_STORE });
      }
      created = await duplicateElements(scene.id, clean);
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
      await setCanvasSize(owner, body.w, body.h);
      break;

    case "rotate_key":
      await rotateSceneKey(owner);
      break;

    default:
      return NextResponse.json(
        { ok: false, error: "unknown_action" },
        { status: 400, headers: NO_STORE },
      );
  }

  // Echo the resulting state so the editor stays in step without a second call.
  const fresh = await studioScene(steamId);
  return NextResponse.json(
    {
      ok: true,
      version: fresh.version,
      sceneKey: fresh.sceneKey,
      canvas: { w: fresh.canvasW, h: fresh.canvasH },
      elements: await getElements(fresh.id),
      removed,
      created,
    },
    { headers: NO_STORE },
  );
}
