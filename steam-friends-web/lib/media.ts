/**
 * The studio's media library: sound files uploaded into a studio, played on
 * stream by a sound element (a widget in "sound" mode, see SoundPlayer).
 *
 * Stored in the studio's own database next to the scenes, as bytea. That's
 * not where you'd put a video collection, but sounds are small, it needs no
 * volume or bucket on either host, and the nightly backup of that database
 * (docker-compose.yml) covers them without anyone remembering to.
 *
 * Each file is served at /api/media/<id> to anyone with the id, because an
 * OBS browser source can't carry a session cookie — the same arrangement as a
 * scene key. The id is random, not derived from the file, so it says nothing
 * about what's behind it. Listing, uploading and deleting are for the studio's
 * editors only (the routes check, through lib/studios).
 *
 * The table creates itself on first use, like the studio tables do.
 */
import crypto from "node:crypto";
import { studioSql as sql } from "./db";

/** Per file. Comfortably more than any sound effect or a few minutes of music. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Per studio, so one studio can't fill the server's disk. */
export const MAX_STUDIO_BYTES = 300 * 1024 * 1024;

export type MediaInfo = {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Seconds, as measured by the uploader's browser; null if it couldn't tell. */
  duration: number | null;
  createdAt: string;
};

export function isMediaId(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{32}$/.test(s);
}

// ---- setup ------------------------------------------------------------------

const G = globalThis as typeof globalThis & { __mediaReady?: Promise<void> | null };

function ready(): Promise<void> {
  if (!G.__mediaReady) {
    G.__mediaReady = sql
      .unsafe(`
        CREATE TABLE IF NOT EXISTS studio_media (
          id         TEXT PRIMARY KEY,
          studio_id  BIGINT NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
          name       TEXT NOT NULL,
          mime       TEXT NOT NULL,
          size       INT NOT NULL,
          duration   REAL,
          data       BYTEA NOT NULL,
          created_by TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS studio_media_studio_idx ON studio_media (studio_id, created_at);
      `)
      .then(() => undefined)
      .catch((err) => {
        G.__mediaReady = null; // try again on the next request
        throw err;
      });
  }
  return G.__mediaReady;
}

// ---- what a file is -----------------------------------------------------------

/**
 * The audio type, decided from the file's first bytes rather than from what
 * the browser said about it. Anything that isn't recognisably audio is turned
 * away, so the library can't be used to host other things behind our domain.
 */
export function sniffAudio(b: Uint8Array): string | null {
  const at = (i: number, s: string) => [...s].every((c, j) => b[i + j] === c.charCodeAt(0));
  if (b.length < 12) return null;
  if (at(0, "ID3")) return "audio/mpeg";
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) {
    // ADTS AAC uses the same sync word; the layer bits tell them apart.
    return (b[1] & 0x06) === 0 ? "audio/aac" : "audio/mpeg";
  }
  if (at(0, "OggS")) return "audio/ogg";
  if (at(0, "RIFF") && at(8, "WAVE")) return "audio/wav";
  if (at(0, "fLaC")) return "audio/flac";
  if (at(4, "ftyp")) return "audio/mp4"; // .m4a
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "audio/webm";
  return null;
}

/** A display name: the file name without its extension, tidied and capped. */
export function cleanName(raw: unknown): string {
  const s = String(raw ?? "")
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return s || "Sound";
}

// ---- the library ------------------------------------------------------------

export async function listMedia(studioId: number): Promise<{ items: MediaInfo[]; used: number }> {
  await ready();
  const rows = await sql`
    SELECT id, name, mime, size, duration, created_at
    FROM studio_media WHERE studio_id = ${studioId}
    ORDER BY created_at DESC, id
  `;
  const items = rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    mime: r.mime as string,
    size: Number(r.size),
    duration: r.duration == null ? null : Number(r.duration),
    createdAt: new Date(r.created_at).toISOString(),
  }));
  return { items, used: items.reduce((n, m) => n + m.size, 0) };
}

export type AddResult =
  | { ok: true; item: MediaInfo }
  | { ok: false; error: "too_big" | "not_audio" | "library_full" | "empty" };

export async function addMedia(
  studioId: number,
  by: string,
  input: { name: unknown; duration: unknown; bytes: Uint8Array },
): Promise<AddResult> {
  await ready();
  const { bytes } = input;
  if (bytes.length === 0) return { ok: false, error: "empty" };
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, error: "too_big" };
  const mime = sniffAudio(bytes);
  if (!mime) return { ok: false, error: "not_audio" };

  const d = Number(input.duration);
  const duration = Number.isFinite(d) && d > 0 && d < 24 * 3600 ? d : null;
  const name = cleanName(input.name);
  const id = crypto.randomBytes(16).toString("hex");

  // The quota check and the insert in one statement, so two uploads at once
  // can't both squeeze under it.
  const rows = await sql`
    INSERT INTO studio_media (id, studio_id, name, mime, size, duration, data, created_by)
    SELECT ${id}, ${studioId}, ${name}, ${mime}, ${bytes.length}, ${duration}, ${Buffer.from(bytes)}, ${by}
    WHERE (SELECT COALESCE(SUM(size), 0) FROM studio_media WHERE studio_id = ${studioId}) + ${bytes.length}
          <= ${MAX_STUDIO_BYTES}
    RETURNING created_at
  `;
  if (!rows[0]) return { ok: false, error: "library_full" };
  return {
    ok: true,
    item: { id, name, mime, size: bytes.length, duration, createdAt: new Date(rows[0].created_at).toISOString() },
  };
}

export async function deleteMedia(studioId: number, id: string): Promise<boolean> {
  await ready();
  const rows = await sql`DELETE FROM studio_media WHERE id = ${id} AND studio_id = ${studioId} RETURNING id`;
  forget(id);
  return rows.length > 0;
}

// ---- serving ------------------------------------------------------------------

/**
 * Recently served files, kept in memory. A browser source asks again for
 * every replay and every range it wants, and a file never changes once
 * uploaded, so there's no reason to read the same megabytes out of the
 * database each time. Bounded by total size; the oldest goes first.
 */
const CACHE_BYTES = 96 * 1024 * 1024;
// Backed by a plain ArrayBuffer (a copy, not a view into a pooled Buffer), which
// is also what Response accepts as a body.
type Cached = { mime: string; data: Uint8Array<ArrayBuffer> };
const C = globalThis as typeof globalThis & { __mediaCache?: Map<string, Cached> };
const cache: Map<string, Cached> = (C.__mediaCache ??= new Map());

function forget(id: string) {
  cache.delete(id);
}

export async function getMedia(id: string): Promise<Cached | null> {
  const hit = cache.get(id);
  if (hit) {
    cache.delete(id); // move to the back: most recently used
    cache.set(id, hit);
    return hit;
  }
  let rows;
  try {
    rows = await sql`SELECT mime, data FROM studio_media WHERE id = ${id}`;
  } catch (err: any) {
    // Nobody has opened the library yet, so there is no table: nothing to find.
    if (err?.code === "42P01") return null;
    throw err;
  }
  if (!rows[0]) return null;
  const item: Cached = { mime: rows[0].mime as string, data: new Uint8Array(rows[0].data as Buffer) };
  if (item.data.length <= CACHE_BYTES / 4) {
    cache.set(id, item);
    let total = 0;
    for (const v of cache.values()) total += v.data.length;
    for (const [k, v] of cache) {
      if (total <= CACHE_BYTES) break;
      cache.delete(k);
      total -= v.data.length;
    }
  }
  return item;
}
