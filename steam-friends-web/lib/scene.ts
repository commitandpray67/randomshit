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
import { studioSql as sql } from "./db";

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
 * A fresh, empty scene for a studio (see lib/studios.ts).
 *
 * `steamId` is whoever caused it to exist. Scenes have always hung off a user,
 * and where the studio's tables share Neon with everything else that's still
 * a foreign key, so it has to be someone who has signed in — which whoever is
 * looking at the studio has.
 */
export async function createStudioScene(studioId: number, steamId: string): Promise<Scene> {
  const rows = await sql`
    INSERT INTO scenes (steam_id, scene_key, studio_id)
    VALUES (${steamId}, ${newKey()}, ${studioId})
    ON CONFLICT (studio_id) WHERE studio_id IS NOT NULL DO NOTHING
    RETURNING *
  `;
  if (rows[0]) return toScene(rows[0]);
  // Someone else created it a moment ago.
  const existing = await sql`SELECT * FROM scenes WHERE studio_id = ${studioId}`;
  return toScene(existing[0]);
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

export async function rotateSceneKey(sceneId: number): Promise<void> {
  await sql`
    UPDATE scenes SET scene_key = ${newKey()}, version = version + 1, updated_at = now()
    WHERE id = ${sceneId}
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

/**
 * A scene and all its elements in one round trip.
 *
 * Reading them separately is two trips to the database, which cost nothing
 * while the app sat next to it on Vercel and cost two transatlantic round
 * trips from the studio's own server — on every change pushed to OBS.
 */
export async function sceneWithElements(
  by: { key: string } | { id: number },
): Promise<{ scene: Scene; elements: SceneElement[] } | null> {
  if ("key" in by && (!by.key || by.key.length > 64)) return null;
  const rows = await sql`
    SELECT s.*,
           COALESCE(
             (SELECT json_agg(e ORDER BY e.z_index, e.id) FROM scene_elements e WHERE e.scene_id = s.id),
             '[]'::json
           ) AS elements
    FROM scenes s
    WHERE ${"key" in by ? sql`s.scene_key = ${by.key}` : sql`s.id = ${by.id}`}
  `;
  if (!rows[0]) return null;
  return { scene: toScene(rows[0]), elements: (rows[0].elements as any[]).map(toElement) };
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
 * A payload of just the version means "re-read the scene" — `writeMoves`
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
    SELECT COALESCE(MAX(z_index), 0) + 1 AS z, COUNT(*) AS n,
           (SELECT canvas_w FROM scenes WHERE id = ${sceneId}) AS canvas_w
    FROM scene_elements WHERE scene_id = ${sceneId}
  `;
  const props = { ...d.props, ...(overrides.props ?? {}) };

  // A new element starts parked just to the right of the frame, in the space
  // the editor keeps round it, rather than on it: the scene may be live, and
  // something half set up shouldn't go out on stream the moment it's made.
  // Dragging it into the frame is what puts it on. Off the right edge
  // specifically, because the editor scrolls that way to reach anything wider
  // than the parking space, and can't scroll to anything above or left of it.
  //
  // Cascaded instead of stacked on one spot, or the newest covers the others
  // and you can't grab what's under it. Wraps so a long session doesn't march
  // off down the page.
  const step = (Number(stats[0].n) % 10) * 32;
  const parkX = Number(stats[0].canvas_w ?? 1920) + 40 + step;
  const parkY = 40 + step;

  const rows = await sql`
    INSERT INTO scene_elements (scene_id, kind, x, y, w, h, z_index, props)
    VALUES (
      ${sceneId}, ${kind},
      ${overrides.x ?? parkX}, ${overrides.y ?? parkY},
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
 * Update one element, returning the scene version the change landed at.
 *
 * Only the provided fields change, and props are merged key by key (`||` on
 * JSONB) so the editor can send a single changed key without resending the
 * rest. The version is what lets an editor tell its own writes apart from a
 * snapshot that predates them — see mergeRemote in the studio.
 *
 * One statement: write, bump, notify. It used to read the row first and write
 * every column back, which was three round trips — a keystroke's worth of
 * latency three times over from a server an ocean away from the database —
 * and it could also write back a position read before a drag landed.
 */
export async function updateElement(
  sceneId: number,
  elementId: number,
  patch: ElementPatch,
): Promise<number | null> {
  // null means "leave as is", matching the old fallback to the current value
  // for anything missing or not a number.
  const opt = (v: unknown, min: number, max: number): number | null => {
    if (v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
  };
  const z = opt(patch.zIndex, -9999, 9999);
  const clipSet = patch.clip !== undefined;
  const clip = patch.clip ? String(patch.clip).slice(0, 400) : null;
  // Objects, not JSON text: postgres.js encodes a json parameter itself, and
  // text would arrive as one JSON string rather than an object.
  const props =
    patch.props && typeof patch.props === "object" && !Array.isArray(patch.props)
      ? sql.json(patch.props as any)
      : null;

  const rows = await sql`
    WITH up AS (
      UPDATE scene_elements SET
        x        = COALESCE(${opt(patch.x, -20000, 20000)}::real, x),
        y        = COALESCE(${opt(patch.y, -20000, 20000)}::real, y),
        w        = COALESCE(${opt(patch.w, 1, 20000)}::real, w),
        h        = COALESCE(${opt(patch.h, 1, 20000)}::real, h),
        rotation = COALESCE(${opt(patch.rotation, -360, 360)}::real, rotation),
        z_index  = COALESCE(${z === null ? null : Math.round(z)}::int, z_index),
        opacity  = COALESCE(${opt(patch.opacity, 0, 1)}::real, opacity),
        locked   = COALESCE(${patch.locked !== undefined ? Boolean(patch.locked) : null}::boolean, locked),
        hidden   = COALESCE(${patch.hidden !== undefined ? Boolean(patch.hidden) : null}::boolean, hidden),
        clip     = CASE WHEN ${clipSet}::boolean THEN ${clip}::text ELSE clip END,
        props    = CASE WHEN ${props}::jsonb IS NULL THEN props ELSE props || ${props}::jsonb END,
        updated_at = now()
      WHERE id = ${elementId} AND scene_id = ${sceneId}
      RETURNING id
    ),
    b AS (
      UPDATE scenes SET version = version + 1, updated_at = now()
      WHERE id = ${sceneId} AND EXISTS (SELECT 1 FROM up)
      RETURNING scene_key, version
    )
    SELECT version, pg_notify('scene_' || scene_key, json_build_object('v', version)::text) FROM b
  `;
  return rows[0] ? Number(rows[0].version) : null;
}

export type Transform = { x: number; y: number; w: number; h: number; rotation: number };

/** One element's new transform during a drag, clamped and ready to write. */
export type Move = { id: number; x: number; y: number; w: number; h: number; r: number; ts: number | null };

/** Clamp a transform from the editor; `ts` is its clock, passed through. */
export function toMove(id: number, t: Partial<Transform> | undefined, sentAt: unknown): Move {
  // Opaque to us: it is the editor's own monotonic clock, meaningful only to
  // the browser source, which spaces its playback by it.
  const ts = Number(sentAt);
  return {
    id,
    x: num(t?.x, -20000, 20000, 0),
    y: num(t?.y, -20000, 20000, 0),
    w: num(t?.w, 1, 20000, 1),
    h: num(t?.h, 1, 20000, 1),
    r: num(t?.rotation, -360, 360, 0),
    ts: Number.isFinite(ts) ? Math.round(ts) : null,
  };
}

/**
 * The drag path's write: move any number of elements in one scene, bump the
 * version once and publish the movement, all in a single statement.
 *
 * Moving a multi-selection used to be one request and one query per element,
 * so each element trailed the one before it. The element ids are checked
 * against the scene here, which is also the permission check: callers pass the
 * scene the editor is entitled to.
 *
 * The NOTIFY carries every movement inline (`ms`: [id, x, y, w, h, r, ts]
 * rows), so a scene stream forwards it without reading anything back. `o`
 * names the process that wrote it; a stream in that same process has already
 * had the movement from memory (see lib/live.ts) and only takes the version.
 */
export async function writeMoves(
  sceneId: number,
  moves: Move[],
  origin: string | null,
): Promise<{ version: number; key: string } | null> {
  if (moves.length === 0) return null;
  const rows = await sql`
    WITH mv AS (
      UPDATE scene_elements e SET
        x = i.x, y = i.y, w = i.w, h = i.h, rotation = i.r, updated_at = now()
      FROM json_to_recordset(${sql.json(moves as any)}::json)
        AS i(id bigint, x double precision, y double precision, w double precision,
             h double precision, r double precision, ts bigint)
      WHERE e.id = i.id AND e.scene_id = ${sceneId}
      RETURNING i.id, i.x, i.y, i.w, i.h, i.r, i.ts
    ),
    ver AS (
      UPDATE scenes SET version = version + 1, updated_at = now()
      WHERE id = ${sceneId} AND EXISTS (SELECT 1 FROM mv)
      RETURNING version, scene_key
    )
    SELECT version, scene_key,
           pg_notify(
             'scene_' || scene_key,
             json_build_object(
               'v', version,
               'o', ${origin}::text,
               'ms', (SELECT json_agg(json_build_array(id, x, y, w, h, r, ts)) FROM mv)
             )::text
           )
    FROM ver
  `;
  return rows[0] ? { version: Number(rows[0].version), key: rows[0].scene_key } : null;
}

/**
 * Delete elements, returning what was removed so it can be put back.
 *
 * Deleting is instant and shared — it vanishes for every editor at once — so
 * the caller gets the rows back and can offer an undo. Nothing is kept
 * server-side; the editor holds the payload and restores it if asked.
 */
export async function deleteElements(
  sceneId: number,
  elementIds: number[],
): Promise<SceneElement[]> {
  const ids = elementIds.map(Number).filter(Number.isFinite);
  if (ids.length === 0) return [];
  const rows = await sql`
    DELETE FROM scene_elements
    WHERE scene_id = ${sceneId} AND id IN ${sql(ids)}
    RETURNING *
  `;
  await bump(sceneId);
  return rows.map(toElement);
}

export async function deleteAllElements(sceneId: number): Promise<SceneElement[]> {
  const rows = await sql`DELETE FROM scene_elements WHERE scene_id = ${sceneId} RETURNING *`;
  await bump(sceneId);
  return rows.map(toElement);
}

/**
 * Put deleted elements back.
 *
 * They come back as new rows: the originals are gone, and nothing references an
 * element by id, so a fresh id costs nothing. Everything that was on screen —
 * position, size, rotation, stacking, contents — is restored as it was.
 */
export async function restoreElements(
  sceneId: number,
  elements: Partial<SceneElement>[],
): Promise<SceneElement[]> {
  if (!Array.isArray(elements) || elements.length === 0) return [];
  const out: SceneElement[] = [];

  await sql.begin(async (tx) => {
    for (const e of elements.slice(0, 100)) {
      if (!KINDS.includes(e.kind as ElementKind)) continue;
      const rows = await tx`
        INSERT INTO scene_elements
          (scene_id, kind, x, y, w, h, rotation, z_index, opacity, locked, hidden, clip, props)
        VALUES (
          ${sceneId}, ${e.kind as string},
          ${num(e.x, -20000, 20000, 0)}, ${num(e.y, -20000, 20000, 0)},
          ${num(e.w, 1, 20000, 320)}, ${num(e.h, 1, 20000, 180)},
          ${num(e.rotation, -360, 360, 0)},
          ${Math.round(num(e.zIndex, -9999, 9999, 0))},
          ${num(e.opacity, 0, 1, 1)},
          ${Boolean(e.locked)}, ${Boolean(e.hidden)},
          ${e.clip ? String(e.clip).slice(0, 400) : null},
          ${sql.json((e.props ?? {}) as any)}
        )
        RETURNING *
      `;
      out.push(toElement(rows[0]));
    }
  });

  await bump(sceneId);
  return out;
}

/**
 * Copy elements, offset a little so the copy is visibly on top of its original
 * rather than exactly hiding it.
 */
export async function duplicateElements(
  sceneId: number,
  elementIds: number[],
): Promise<SceneElement[]> {
  const ids = elementIds.map(Number).filter(Number.isFinite);
  if (ids.length === 0) return [];

  const source = await sql`
    SELECT * FROM scene_elements
    WHERE scene_id = ${sceneId} AND id IN ${sql(ids)}
    ORDER BY z_index ASC, id ASC
  `;
  if (source.length === 0) return [];

  const top = await sql`
    SELECT COALESCE(MAX(z_index), 0) AS z FROM scene_elements WHERE scene_id = ${sceneId}
  `;
  let z = Number(top[0].z);
  const out: SceneElement[] = [];

  await sql.begin(async (tx) => {
    for (const s of source) {
      z += 1;
      const rows = await tx`
        INSERT INTO scene_elements
          (scene_id, kind, x, y, w, h, rotation, z_index, opacity, locked, hidden, clip, props)
        VALUES (
          ${sceneId}, ${s.kind},
          ${Number(s.x) + 24}, ${Number(s.y) + 24},
          ${s.w}, ${s.h}, ${s.rotation}, ${z}, ${s.opacity},
          ${false}, ${s.hidden}, ${s.clip}, ${sql.json(s.props ?? {})}
        )
        RETURNING *
      `;
      out.push(toElement(rows[0]));
    }
  });

  await bump(sceneId);
  return out;
}

/**
 * Send elements to the very front or back of the stack.
 *
 * ▲/▼ move one step at a time, which is fine for three layers and tedious for
 * a dozen. The whole stack is renumbered so z values stay dense.
 */
export async function restackElements(
  sceneId: number,
  elementIds: number[],
  to: "front" | "back",
): Promise<void> {
  const ids = new Set(elementIds.map(Number).filter(Number.isFinite));
  if (ids.size === 0) return;

  const all = await getElements(sceneId);
  const moving = all.filter((e) => ids.has(e.id));
  const rest = all.filter((e) => !ids.has(e.id));
  if (moving.length === 0) return;

  const order = to === "front" ? [...rest, ...moving] : [...moving, ...rest];
  await writeStack(sceneId, order.map((e) => e.id));
  await bump(sceneId);
}

/**
 * Renumber the stack as 0..n-1 in the given order, in one statement rather
 * than one per element — a dozen round trips to a distant database is seconds.
 */
async function writeStack(sceneId: number, ids: number[]): Promise<void> {
  await sql`
    UPDATE scene_elements e SET z_index = o.k - 1
    FROM json_array_elements_text(${sql.json(ids)}::json) WITH ORDINALITY AS o(id, k)
    WHERE e.id = o.id::bigint AND e.scene_id = ${sceneId}
  `;
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
  await writeStack(sceneId, order.map((e) => e.id));
  await bump(sceneId);
}

export async function setCanvasSize(
  sceneId: number,
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
      WHERE id = ${sceneId}
      RETURNING scene_key, version
    )
    SELECT pg_notify('scene_' || scene_key, json_build_object('v', version)::text) FROM c
  `;
}
