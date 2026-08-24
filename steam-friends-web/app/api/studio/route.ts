import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isOverlayAllowed } from "@/lib/overlay";
import { rateLimit } from "@/lib/ratelimit";
import {
  KINDS,
  type ElementKind,
  ensureScene,
  addElement,
  updateElement,
  deleteElement,
  deleteAllElements,
  reorderElement,
  setCanvasSize,
  rotateSceneKey,
  getElements,
} from "@/lib/scene";

/**
 * Editor mutations. A JSON endpoint rather than server actions because
 * dragging an element fires a burst of updates, and a server action would
 * revalidate the whole page on each one.
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

  // Generous: a drag emits many small updates, but not unbounded.
  const rl = rateLimit(`studio:${steamId}`, 600, 60);
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

  const scene = await ensureScene(steamId);
  const action = String(body?.action ?? "");

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
      await updateElement(scene.id, id, body.patch ?? {});
      break;
    }

    case "delete": {
      const id = Number(body.id);
      if (!Number.isFinite(id)) {
        return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400, headers: NO_STORE });
      }
      await deleteElement(scene.id, id);
      break;
    }

    case "clear":
      await deleteAllElements(scene.id);
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
      await setCanvasSize(steamId, body.w, body.h);
      break;

    case "rotate_key":
      await rotateSceneKey(steamId);
      break;

    default:
      return NextResponse.json(
        { ok: false, error: "unknown_action" },
        { status: 400, headers: NO_STORE },
      );
  }

  // Echo the resulting state so the editor stays in step without a second call.
  const fresh = await ensureScene(steamId);
  return NextResponse.json(
    {
      ok: true,
      version: fresh.version,
      sceneKey: fresh.sceneKey,
      canvas: { w: fresh.canvasW, h: fresh.canvasH },
      elements: await getElements(fresh.id),
    },
    { headers: NO_STORE },
  );
}
