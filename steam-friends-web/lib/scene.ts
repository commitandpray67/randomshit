/**
 * Overlay studio: a canvas of freely-positioned elements shown in OBS.
 *
 * The element model follows Pogly's (transform, clip, transparency, locked,
 * z-index, per-kind payload). What's deliberately absent is Pogly's real-time
 * collaboration layer — guests, cursors, permissions, layouts, audit log —
 * which needs a stateful websocket server. This is a single-editor build on
 * serverless: the editor writes, the browser source polls a version number.
 */
import crypto from "node:crypto";
import { sql } from "./db";

export type ElementKind = "text" | "image" | "video" | "widget";

export const KINDS: ElementKind[] = ["text", "image", "video", "widget"];

export type SceneElement = {
  id: number;
  kind: ElementKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  zIndex: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  clip: string | null;
  props: Record<string, unknown>;
};

export type Scene = {
  id: number;
  steamId: string;
  sceneKey: string;
  name: string;
  canvasW: number;
  canvasH: number;
  version: number;
};

function newKey(): string {
  return crypto.randomBytes(16).toString("hex");
}

function toScene(row: any): Scene {
  return {
    id: Number(row.id),
    steamId: row.steam_id,
    sceneKey: row.scene_key,
    name: row.name,
    canvasW: row.canvas_w,
    canvasH: row.canvas_h,
    version: Number(row.version),
  };
}

function toElement(row: any): SceneElement {
  return {
    id: Number(row.id),
    kind: row.kind,
    x: Number(row.x),
    y: Number(row.y),
    w: Number(row.w),
    h: Number(row.h),
    rotation: Number(row.rotation),
    zIndex: Number(row.z_index),
    opacity: Number(row.opacity),
    locked: row.locked,
    hidden: row.hidden,
    clip: row.clip,
    props: row.props ?? {},
  };
}

/**
 * The user's scene, created on first visit to the studio.
 *
 * Select-then-insert rather than ON CONFLICT: steam_id is deliberately not
 * unique here (room for multiple scenes later, the way Pogly has layouts), and
 * ON CONFLICT needs a matching constraint to target.
 */
export async function ensureScene(steamId: string): Promise<Scene> {
  const existing = await sql`
    SELECT * FROM scenes WHERE steam_id = ${steamId} ORDER BY id ASC LIMIT 1
  `;
  if (existing[0]) return toScene(existing[0]);

  const rows = await sql`
    INSERT INTO scenes (steam_id, scene_key) VALUES (${steamId}, ${newKey()}) RETURNING *
  `;
  return toScene(rows[0]);
}

export async function getSceneByKey(key: string): Promise<Scene | null> {
  if (!key || key.length > 64) return null;
  const rows = await sql`SELECT * FROM scenes WHERE scene_key = ${key}`;
  return rows[0] ? toScene(rows[0]) : null;
}

export async function getSceneForUser(steamId: string): Promise<Scene | null> {
  const rows = await sql`
    SELECT * FROM scenes WHERE steam_id = ${steamId} ORDER BY id ASC LIMIT 1
  `;
  return rows[0] ? toScene(rows[0]) : null;
}

export async function rotateSceneKey(steamId: string): Promise<void> {
  await sql`
    UPDATE scenes SET scene_key = ${newKey()}, version = version + 1, updated_at = now()
    WHERE steam_id = ${steamId}
  `;
}

/** Just the version — what the browser source polls between changes. */
export async function getSceneVersion(key: string): Promise<number | null> {
  const rows = await sql`SELECT version FROM scenes WHERE scene_key = ${key}`;
  return rows[0] ? Number(rows[0].version) : null;
}

export async function getElements(sceneId: number): Promise<SceneElement[]> {
  const rows = await sql`
    SELECT * FROM scene_elements WHERE scene_id = ${sceneId}
    ORDER BY z_index ASC, id ASC
  `;
  return rows.map(toElement);
}

async function bump(sceneId: number): Promise<void> {
  await sql`
    UPDATE scenes SET version = version + 1, updated_at = now() WHERE id = ${sceneId}
  `;
}

function num(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Defaults per kind, so a newly added element is visible immediately. */
function defaultsFor(kind: ElementKind): { w: number; h: number; props: Record<string, unknown> } {
  switch (kind) {
    case "text":
      return {
        w: 480,
        h: 120,
        props: {
          text: "New text",
          color: "#ffffff",
          fontSize: 64,
          fontFamily: "system-ui, sans-serif",
          weight: 700,
          align: "left",
          shadow: true,
        },
      };
    case "image":
      return { w: 320, h: 320, props: { url: "", fit: "contain" } };
    case "video":
      return {
        w: 640,
        h: 360,
        props: { url: "", loop: true, muted: true, autoplay: true, volume: 1, fit: "contain" },
      };
    case "widget":
      return { w: 480, h: 320, props: { mode: "html", html: "", url: "" } };
  }
}

export async function addElement(
  sceneId: number,
  kind: ElementKind,
  overrides: Partial<SceneElement> = {},
): Promise<SceneElement> {
  const d = defaultsFor(kind);
  const stats = await sql`
    SELECT COALESCE(MAX(z_index), 0) + 1 AS z, COUNT(*) AS n
    FROM scene_elements WHERE scene_id = ${sceneId}
  `;
  const props = { ...d.props, ...(overrides.props ?? {}) };

  // Cascade each new element instead of stacking them all on the same spot —
  // otherwise the newest one covers the others and you can't grab what's under
  // it. Wraps so a long session doesn't march off the canvas.
  const step = (Number(stats[0].n) % 10) * 32;

  const rows = await sql`
    INSERT INTO scene_elements (scene_id, kind, x, y, w, h, z_index, props)
    VALUES (
      ${sceneId}, ${kind},
      ${overrides.x ?? 80 + step}, ${overrides.y ?? 80 + step},
      ${overrides.w ?? d.w}, ${overrides.h ?? d.h},
      ${Number(stats[0].z)}, ${sql.json(props as any)}
    )
    RETURNING *
  `;
  await bump(sceneId);
  return toElement(rows[0]);
}

export type ElementPatch = {
  x?: unknown;
  y?: unknown;
  w?: unknown;
  h?: unknown;
  rotation?: unknown;
  zIndex?: unknown;
  opacity?: unknown;
  locked?: unknown;
  hidden?: unknown;
  clip?: unknown;
  props?: Record<string, unknown>;
};

/**
 * Update one element. Only the provided fields change; props are merged so the
 * editor can send a single changed key without resending the whole payload.
 */
export async function updateElement(
  sceneId: number,
  elementId: number,
  patch: ElementPatch,
): Promise<void> {
  const cur = (
    await sql`SELECT * FROM scene_elements WHERE id = ${elementId} AND scene_id = ${sceneId}`
  )[0];
  if (!cur) return;

  const props =
    patch.props && typeof patch.props === "object"
      ? { ...(cur.props ?? {}), ...patch.props }
      : (cur.props ?? {});

  await sql`
    UPDATE scene_elements SET
      x        = ${patch.x        !== undefined ? num(patch.x, -20000, 20000, cur.x) : cur.x},
      y        = ${patch.y        !== undefined ? num(patch.y, -20000, 20000, cur.y) : cur.y},
      w        = ${patch.w        !== undefined ? num(patch.w, 1, 20000, cur.w) : cur.w},
      h        = ${patch.h        !== undefined ? num(patch.h, 1, 20000, cur.h) : cur.h},
      rotation = ${patch.rotation !== undefined ? num(patch.rotation, -360, 360, cur.rotation) : cur.rotation},
      z_index  = ${patch.zIndex   !== undefined ? Math.round(num(patch.zIndex, -9999, 9999, cur.z_index)) : cur.z_index},
      opacity  = ${patch.opacity  !== undefined ? num(patch.opacity, 0, 1, cur.opacity) : cur.opacity},
      locked   = ${patch.locked   !== undefined ? Boolean(patch.locked) : cur.locked},
      hidden   = ${patch.hidden   !== undefined ? Boolean(patch.hidden) : cur.hidden},
      clip     = ${patch.clip     !== undefined ? (patch.clip ? String(patch.clip).slice(0, 400) : null) : cur.clip},
      props    = ${sql.json(props as any)},
      updated_at = now()
    WHERE id = ${elementId} AND scene_id = ${sceneId}
  `;
  await bump(sceneId);
}

export async function deleteElement(sceneId: number, elementId: number): Promise<void> {
  await sql`DELETE FROM scene_elements WHERE id = ${elementId} AND scene_id = ${sceneId}`;
  await bump(sceneId);
}

export async function deleteAllElements(sceneId: number): Promise<void> {
  await sql`DELETE FROM scene_elements WHERE scene_id = ${sceneId}`;
  await bump(sceneId);
}

/** Move one element up or down the stack, swapping z with its neighbour. */
export async function reorderElement(
  sceneId: number,
  elementId: number,
  direction: "up" | "down",
): Promise<void> {
  const all = await getElements(sceneId);
  const i = all.findIndex((e) => e.id === elementId);
  if (i < 0) return;
  const j = direction === "up" ? i + 1 : i - 1;
  if (j < 0 || j >= all.length) return;

  // Rewrite the whole stack as 0..n-1 with the two swapped. Cheap at overlay
  // sizes and avoids duplicate z values drifting in over time.
  const order = [...all];
  [order[i], order[j]] = [order[j], order[i]];
  await sql.begin(async (tx) => {
    for (let k = 0; k < order.length; k++) {
      await tx`UPDATE scene_elements SET z_index = ${k} WHERE id = ${order[k].id}`;
    }
  });
  await bump(sceneId);
}

export async function setCanvasSize(
  steamId: string,
  w: unknown,
  h: unknown,
): Promise<void> {
  await sql`
    UPDATE scenes SET
      canvas_w = ${Math.round(num(w, 16, 7680, 1920))},
      canvas_h = ${Math.round(num(h, 16, 4320, 1080))},
      version = version + 1,
      updated_at = now()
    WHERE steam_id = ${steamId}
  `;
}
