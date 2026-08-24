/**
 * Overlay studio: a canvas of freely-positioned elements shown in OBS.
 *
 * The element model follows Pogly's (transform, clip, transparency, locked,
 * z-index, per-kind payload). What's deliberately absent is Pogly's real-time
 * collaboration layer — guests, cursors, permissions, layouts, audit log —
 * which needs a stateful websocket server. This is a single-editor build on
 * serverless: the editor writes, and the browser source is woken by NOTIFY
 * (falling back to polling a version number).
 */
import crypto from "node:crypto";
import { sql } from "./db";
import { studioOwner } from "./overlay";

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

/**
 * The scene an editor should be working on: the shared one, or their own if
 * the owner has never signed in and so has no row to hang a scene off.
 */
export async function studioScene(steamId: string): Promise<Scene> {
  const owner = studioOwner(steamId);
  if (owner && owner !== steamId) {
    const known = await sql`SELECT 1 FROM users WHERE steam_id = ${owner}`;
    if (known.length) return ensureScene(owner);
    // Falling back rather than throwing: an allowlist naming somebody who
    // hasn't logged in yet shouldn't lock the others out of the studio.
  }
  return ensureScene(steamId);
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

/** LISTEN/NOTIFY channel for one scene. */
export function sceneChannel(key: string): string {
  return `scene_${key}`;
}

/**
 * A channel name is an identifier, not a bound parameter, so only a key that
 * looks like one of ours may be handed to LISTEN. Keys are 32 hex characters;
 * anything else falls back to polling rather than being interpolated into SQL.
 */
export function isChannelSafeKey(key: string): boolean {
  return /^[0-9a-f]{8,48}$/.test(key);
}

/**
 * Bump the version and wake any listening browser source, in one round trip.
 *
 * The NOTIFY is what lets the scene stream stop polling: the watcher is woken
 * by the commit itself instead of rediscovering the change up to a tick later.
 * A payload of just the version means "re-read the scene" — `applyTransform`
 * below sends the movement inline instead, so a drag needs no read at all.
 */
async function bump(sceneId: number): Promise<number | null> {
  const rows = await sql`
    WITH b AS (
      UPDATE scenes SET version = version + 1, updated_at = now()
      WHERE id = ${sceneId}
      RETURNING scene_key, version
    )
    SELECT version, pg_notify('scene_' || scene_key, json_build_object('v', version)::text) FROM b
  `;
  return rows[0] ? Number(rows[0].version) : null;
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
/**
 * Update one element, returning the scene version the change landed at.
 *
 * The version is what lets an editor tell its own writes apart from a snapshot
 * that predates them — see mergeRemote in the studio.
 */
export async function updateElement(
  sceneId: number,
  elementId: number,
  patch: ElementPatch,
): Promise<number | null> {
  const cur = (
    await sql`SELECT * FROM scene_elements WHERE id = ${elementId} AND scene_id = ${sceneId}`
  )[0];
  if (!cur) return null;

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
  return bump(sceneId);
}

export type Transform = { x: number; y: number; w: number; h: number; rotation: number };

/**
 * The drag path: move one element and publish the movement, in a single
 * statement.
 *
 * `updateElement` is the general case and costs six round trips to the
 * database — read the element, merge props, write it, bump the version, then
 * the route re-reads the scene and every element to echo state back. That is
 * fine for a property edit but ruinous forty times a second, and the latency
 * it adds is what the browser source ends up rendering as stutter.
 *
 * Here the whole thing is one CTE: locate the element through its scene (which
 * is also the ownership check), write the transform, bump the version, and
 * NOTIFY with the new position inline. The scene stream can then forward that
 * payload straight to OBS without reading anything back, so a drag frame costs
 * exactly one query end to end.
 *
 * `mv` is never selected from, which is deliberate: a data-modifying CTE runs
 * whether or not anything references it.
 */
export async function applyTransform(
  steamId: string,
  elementId: number,
  t: Partial<Transform>,
  sentAt?: unknown,
): Promise<number | null> {
  // Resolving the shared owner would cost a lookup, and the whole point of
  // this path is that it is one statement. Both candidates go into the join
  // instead — the caller's own scene and the shared one — and since element
  // ids are unique the join simply confirms the element belongs to a scene
  // this editor is entitled to touch. Both are on the allowlist either way.
  const owner = studioOwner(steamId);
  const x = num(t.x, -20000, 20000, 0);
  const y = num(t.y, -20000, 20000, 0);
  const w = num(t.w, 1, 20000, 1);
  const h = num(t.h, 1, 20000, 1);
  const r = num(t.rotation, -360, 360, 0);
  // Opaque to us: it is the editor's own monotonic clock, meaningful only to
  // the browser source that reads it back. Passed through as a number or not
  // at all.
  const ts = Number(sentAt);
  const stamp = Number.isFinite(ts) ? Math.round(ts) : null;

  const rows = await sql`
    WITH tgt AS (
      SELECT e.id AS eid, s.id AS sid
      FROM scene_elements e
      JOIN scenes s ON s.id = e.scene_id
      WHERE e.id = ${elementId} AND s.steam_id IN ${sql([steamId, owner])}
    ),
    mv AS (
      UPDATE scene_elements SET
        x = ${x}, y = ${y}, w = ${w}, h = ${h}, rotation = ${r}, updated_at = now()
      FROM tgt WHERE scene_elements.id = tgt.eid
      RETURNING scene_elements.id
    ),
    ver AS (
      UPDATE scenes SET version = version + 1, updated_at = now()
      FROM tgt WHERE scenes.id = tgt.sid
      RETURNING scenes.version AS v, scenes.scene_key AS skey
    )
    SELECT v AS version,
           pg_notify(
             'scene_' || skey,
             json_build_object(
               'v', v,
               'ts', ${stamp}::bigint,
               -- json_build_array takes "any", so a bare placeholder gives
               -- Postgres nothing to infer a type from and it refuses to plan
               -- the statement. Every one of these has to be cast.
               'm', json_build_array(
                 ${elementId}::bigint,
                 ${x}::double precision,
                 ${y}::double precision,
                 ${w}::double precision,
                 ${h}::double precision,
                 ${r}::double precision
               )
             )::text
           )
    FROM ver
  `;
  return rows[0] ? Number(rows[0].version) : null;
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
    WITH c AS (
      UPDATE scenes SET
        canvas_w = ${Math.round(num(w, 16, 7680, 1920))},
        canvas_h = ${Math.round(num(h, 16, 4320, 1080))},
        version = version + 1,
        updated_at = now()
      WHERE steam_id = ${steamId}
      RETURNING scene_key, version
    )
    SELECT pg_notify('scene_' || scene_key, json_build_object('v', version)::text) FROM c
  `;
}
