/**
 * What a long-running server can do that serverless can't: keep state between
 * requests, and hand a drag to OBS without waiting for the database.
 *
 * On Vercel every drag frame went editor → function → database → NOTIFY →
 * stream → OBS, and that was fine because the database sat in the same data
 * centre. The studio's own server is an ocean away from it, so the same path
 * waits out a transatlantic round trip before OBS hears anything — and the
 * editor, which sends the next position only once the last one is answered,
 * slows to the pace of that round trip too.
 *
 * Here every editor and every OBS source is connected to this one process, so
 * a movement is published to them from memory the moment it arrives, and
 * written to the database behind it. The database stays the record — a reload,
 * the lite source and anything on Vercel still read it — it just stops being
 * in the way.
 *
 * What that takes:
 *
 * - The bus: scene streams in this process subscribe by scene key.
 * - The write-behind queue: newest position per element, written in batches,
 *   one statement per round trip, in order.
 * - The overlay: a snapshot read from the database can predate positions
 *   already shown live, and sending it would drag elements back. Positions not
 *   yet in the snapshot are laid over it.
 * - The barrier: any other edit waits for queued positions to land first, so
 *   the database sees changes in the order they were made.
 *
 * None of it runs on Vercel (`LIVE` is false there): a function can be frozen
 * the moment it responds, which would strand the queue, and the stream it
 * would publish to is almost never in the same instance.
 *
 * State lives on globalThis because Next bundles each route separately, and a
 * module-level Map could otherwise be a different Map in the route that
 * publishes and the route that listens.
 */
import crypto from "node:crypto";
import { studioSql as sql } from "./db";
import { writeMoves, type Move } from "./scene";

export const LIVE = !process.env.VERCEL;

export type LiveEvent =
  /** A movement, in the same shape the stream sends: [id, x, y, w, h, rotation]. */
  | { type: "motion"; ts: number | null; m: [number, number, number, number, number, number] }
  /** Movements up to here are in the database, at this version. */
  | { type: "version"; v: number };

type Listener = (e: LiveEvent) => void;

/** The newest position shown live for an element; `v` once it is written. */
type Pending = { x: number; y: number; w: number; h: number; r: number; v: number | null; at: number };
type Queued = Move & { sceneId: number; gen: number; pend: Pending };
/** The canvas being edited: its id, and the key its streams listen under. */
export type SceneRef = { id: number; key: string };

type State = {
  origin: string;
  subs: Map<string, Set<Listener>>;
  members: Map<number, { ids: Set<number>; at: number }>;
  pending: Map<number, Pending>;
  queue: Map<number, Queued>;
  inflight: Queued[];
  writing: boolean;
  gen: number;
  waiters: { gen: number; done: () => void }[];
};

const G = globalThis as typeof globalThis & { __studioLive?: State };
const S: State = (G.__studioLive ??= {
  origin: crypto.randomBytes(6).toString("hex"),
  subs: new Map(),
  members: new Map(),
  pending: new Map(),
  queue: new Map(),
  inflight: [],
  writing: false,
  gen: 0,
  waiters: [],
});

/** Names this process in NOTIFY payloads, so its own streams can skip them. */
export const ORIGIN = S.origin;

// ---- the bus ---------------------------------------------------------------

export function subscribe(key: string, fn: Listener): () => void {
  let set = S.subs.get(key);
  if (!set) S.subs.set(key, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0 && S.subs.get(key) === set) S.subs.delete(key);
  };
}

function publish(key: string, e: LiveEvent): void {
  const set = S.subs.get(key);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(e);
    } catch {
      /* one broken stream must not stop the rest */
    }
  }
}

// ---- which elements a scene has --------------------------------------------

/** How soon an unknown id may trigger another look at the database. */
const MEMBERS_RELOAD_MS = 2000;

/**
 * Whether an element belongs to a scene, which is the permission check for
 * publishing its movement. The database write checks again for itself.
 */
async function isMember(sceneId: number, id: number): Promise<boolean> {
  const known = S.members.get(sceneId);
  if (known?.ids.has(id)) return true;
  if (known && Date.now() - known.at < MEMBERS_RELOAD_MS) return false;
  const rows = await sql`SELECT id FROM scene_elements WHERE scene_id = ${sceneId}`;
  const fresh = { ids: new Set(rows.map((r) => Number(r.id))), at: Date.now() };
  S.members.set(sceneId, fresh);
  return fresh.ids.has(id);
}

/** Keep the membership list in step with adds and deletes made here. */
export function noteElements(sceneId: number, added: number[], removed: number[] = []): void {
  const known = S.members.get(sceneId);
  if (!known) return;
  for (const id of added) known.ids.add(id);
  for (const id of removed) known.ids.delete(id);
}

// ---- movement --------------------------------------------------------------

/**
 * Publish movements to every stream on this scene now, and queue them for the
 * database. Returns how many were accepted; unknown elements are dropped.
 */
export async function moveLive(ref: SceneRef, moves: Move[]): Promise<number> {
  const ok: Move[] = [];
  for (const mv of moves) if (await isMember(ref.id, mv.id)) ok.push(mv);

  // Published and queued in one synchronous pass, so the order the editor
  // sent them in is the order everyone sees and the order they are written.
  const now = Date.now();
  for (const mv of ok) {
    publish(ref.key, { type: "motion", ts: mv.ts, m: [mv.id, mv.x, mv.y, mv.w, mv.h, mv.r] });
    const pend: Pending = { x: mv.x, y: mv.y, w: mv.w, h: mv.h, r: mv.r, v: null, at: now };
    S.pending.set(mv.id, pend);
    S.queue.set(mv.id, { ...mv, sceneId: ref.id, gen: ++S.gen, pend });
  }
  if (ok.length) void drain();
  return ok.length;
}

/** Well inside NOTIFY's 8000-byte payload limit at ~80 bytes a row. */
const BATCH = 40;
/** How long a written position is still laid over snapshots. */
const PENDING_KEEP_MS = 30_000;

/**
 * Write the queue, newest position per element, one batch per round trip.
 *
 * However fast positions arrive, the database gets at most one write per round
 * trip, each carrying the latest of everything that moved meanwhile — so a
 * slow link to it costs how *recent* the stored position is, never how smooth
 * the live one looks.
 */
async function drain(): Promise<void> {
  if (S.writing) return;
  S.writing = true;
  let failures = 0;
  try {
    while (S.queue.size > 0) {
      // One scene per statement. There is one studio scene, so in practice
      // this is everything.
      const sceneId = S.queue.values().next().value!.sceneId;
      const batch: Queued[] = [];
      for (const [id, q] of S.queue) {
        if (q.sceneId !== sceneId) continue;
        batch.push(q);
        S.queue.delete(id);
        if (batch.length >= BATCH) break;
      }
      S.inflight = batch;

      let res: Awaited<ReturnType<typeof writeMoves>> = null;
      try {
        res = await writeMoves(
          sceneId,
          batch.map(({ id, x, y, w, h, r, ts }) => ({ id, x, y, w, h, r, ts })),
          ORIGIN,
        );
        failures = 0;
      } catch {
        // Keep whatever hasn't been superseded meanwhile, and back off. The
        // positions stay live on screen either way; only the record waits.
        S.inflight = [];
        for (const q of batch) if (!S.queue.has(q.id)) S.queue.set(q.id, q);
        failures++;
        wake();
        await new Promise((r) => setTimeout(r, Math.min(5000, 250 * 2 ** failures)));
        continue;
      }

      S.inflight = [];
      if (res) {
        for (const q of batch) if (S.pending.get(q.id) === q.pend) q.pend.v = res.version;
        publish(res.key, { type: "version", v: res.version });
      } else {
        // None of them exist any more — deleted while the drag was in flight.
        for (const q of batch) if (S.pending.get(q.id) === q.pend) S.pending.delete(q.id);
      }
      wake();
    }
  } finally {
    S.writing = false;
    const cutoff = Date.now() - PENDING_KEEP_MS;
    for (const [id, p] of S.pending) if (p.v !== null && p.at < cutoff) S.pending.delete(id);
  }
}

function outstanding(gen: number): boolean {
  for (const q of S.queue.values()) if (q.gen <= gen) return true;
  return S.inflight.some((q) => q.gen <= gen);
}

function wake(): void {
  S.waiters = S.waiters.filter((w) => {
    if (outstanding(w.gen)) return true;
    w.done();
    return false;
  });
}

/**
 * Resolves once every movement queued before the call is in the database.
 *
 * Any other edit waits on this first. Without it, a property change made just
 * after a drag could reach the database before the drag's final position did,
 * and the stale position would then be written over it.
 *
 * Gives up after `timeoutMs` rather than hang an edit on a database that is
 * down; the edit would fail on its own then anyway.
 */
export function motionSettled(timeoutMs = 5000): Promise<void> {
  const gen = S.gen;
  if (!outstanding(gen)) return Promise.resolve();
  return new Promise((resolve) => {
    const w = { gen, done: resolve };
    S.waiters.push(w);
    setTimeout(() => {
      S.waiters = S.waiters.filter((x) => x !== w);
      resolve();
    }, timeoutMs);
  });
}

type Placed = { id: number; x: number; y: number; w: number; h: number; rotation: number };

/**
 * Lay positions already shown live over a snapshot read at `version`.
 *
 * A position counts as missing from the snapshot if it isn't written yet, or
 * was written at a later version than the snapshot was read at. Anything the
 * snapshot does include is left alone — including a later edit to the same
 * element, which is why this goes by version rather than by age.
 */
export function withLiveMoves<T extends Placed>(version: number, elements: T[]): T[] {
  if (!LIVE || S.pending.size === 0) return elements;
  return elements.map((e) => {
    const p = S.pending.get(e.id);
    if (!p || (p.v !== null && p.v <= version)) return e;
    return { ...e, x: p.x, y: p.y, w: p.w, h: p.h, rotation: p.r };
  });
}
