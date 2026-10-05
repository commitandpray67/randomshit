/**
 * Every walking chat pet, and who gets which: all of it lives in the studio's
 * database and is managed in the studio (Custom pets…), so none of it needs a
 * rebuild. The pets page asks for what applies to its chat when it loads and
 * every minute after.
 *
 * A sprite either belongs to one studio — its streamer's chat — or to none,
 * in which case it applies in every chat. Either way it's given to one chatter
 * by their Twitch login, or, with no login, it's in a mix that everyone else
 * is picked from:
 *
 *                   one studio              no studio (admins only)
 *   login           that chatter, here      that chatter, in every chat
 *   no login        this chat's own mix     the default mix
 *
 * In a streamer's chat, a chatter gets their own sprite for this chat if they
 * have one, else their every-chat one, else a pick from the mix. The mix is
 * the chat's own sprites plus, unless the studio has turned it off
 * (studios.pets_default_mix), the default mix.
 *
 * The strips are cut and laid out in the uploader's browser (lib/spritesheet),
 * and what's stored is the finished PNG, checked to be one of a sane shape.
 * Stored as bytea next to the scenes, so the nightly backup has them.
 *
 * The pets that used to be built into the app are copied in the first time
 * this runs (seedBuiltIns), with the assignments they had; after that the
 * app's copies are never read again.
 */
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { studioSql as sql } from "./db";
import { studiosReady } from "./studios";
import { WALK_SETS } from "@/app/chatpets/sprites/walk";
import { DEFAULT_SET, STREAMER_SETS, CHATTER_SPRITES } from "@/app/chatpets/pets";

export const MAX_SPRITE_BYTES = 2 * 1024 * 1024;
export const MAX_SPRITES_PER_STUDIO = 300;
/** Largest cell either way, in px. The original strips are about 250×160. */
const MAX_CELL = 800;

const LOGIN = /^[a-z0-9_]{1,25}$/;

export function cleanLogin(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase().replace(/^@/, "");
  return LOGIN.test(s) ? s : null;
}

export function isSpriteId(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{32}$/.test(s);
}

function cleanName(v: unknown): string {
  return String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40) || "Pet";
}

export type PetSprite = {
  id: string;
  name: string;
  /** Twitch login it's given to; null means it's in a mix. */
  login: string | null;
  /** Applies in every chat rather than one studio's (no studio). */
  global: boolean;
  /** One cell of the strip, in px. */
  w: number;
  h: number;
  createdAt: string;
};

/** As the pets page uses them: where to load the strip from, and its cell size. */
export type ServedSprite = { id: string; src: string; w: number; h: number };

// ---- setup --------------------------------------------------------------------

const G = globalThis as typeof globalThis & {
  __petSpritesReady?: Promise<void> | null;
  __petSpritesSeeded?: Promise<void> | null;
};

function ready(): Promise<void> {
  if (!G.__petSpritesReady) {
    G.__petSpritesReady = studiosReady()
      .then(() =>
        sql.unsafe(`
          CREATE TABLE IF NOT EXISTS pet_sprites (
            id          TEXT PRIMARY KEY,
            studio_id   BIGINT REFERENCES studios(id) ON DELETE CASCADE,
            name        TEXT NOT NULL,
            login       TEXT,
            w           INT NOT NULL,
            h           INT NOT NULL,
            data        BYTEA NOT NULL,
            created_by  TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
          );
          -- The first version required a studio and marked every-chat ones
          -- with a flag; now they simply have none.
          ALTER TABLE pet_sprites ALTER COLUMN studio_id DROP NOT NULL;
          DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'pet_sprites' AND column_name = 'everywhere') THEN
              UPDATE pet_sprites SET studio_id = NULL WHERE everywhere;
              ALTER TABLE pet_sprites DROP COLUMN everywhere;
            END IF;
          END $$;
          DROP INDEX IF EXISTS pet_sprites_everywhere_idx;
          CREATE INDEX IF NOT EXISTS pet_sprites_studio_idx ON pet_sprites (studio_id, created_at);
          CREATE INDEX IF NOT EXISTS pet_sprites_global_idx ON pet_sprites (created_at) WHERE studio_id IS NULL;
          ALTER TABLE studios ADD COLUMN IF NOT EXISTS pets_default_mix BOOLEAN NOT NULL DEFAULT true;
          CREATE TABLE IF NOT EXISTS pet_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        `),
      )
      .then(() => undefined)
      .catch((err) => {
        G.__petSpritesReady = null;
        throw err;
      });
  }
  return G.__petSpritesReady;
}

/**
 * The pets that were built into the app, copied in once with the assignments
 * they had: the default set as the default mix, a streamer's own set as their
 * chat's mix (with the default mix off, as it was), and chatters' own sprites
 * as every-chat ones. Recorded in pet_meta, so it never runs twice, and under
 * a lock, so two first requests at once don't both do it.
 *
 * A failure is logged and tried again on a later request rather than stopping
 * the studio: everything else works without it.
 */
function seeded(): Promise<void> {
  if (!G.__petSpritesSeeded) {
    G.__petSpritesSeeded = ready()
      .then(seedBuiltIns)
      .catch((err) => {
        console.error("[pets] copying the built-in pets in failed; will try again", err);
        setTimeout(() => (G.__petSpritesSeeded = null), 60_000);
      });
  }
  return G.__petSpritesSeeded;
}

/** A built-in strip's bytes: from the build's own static files, or over HTTP if they aren't on disk. */
async function builtInBytes(src: string): Promise<Buffer> {
  // src is "/_next/static/media/<file>", served from .next/static.
  try {
    return await readFile(join(process.cwd(), ".next", src.replace(/^\/_next\//, "")));
  } catch {
    const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
    const res = await fetch(base + src);
    if (!res.ok) throw new Error(`${src}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

async function seedBuiltIns(): Promise<void> {
  const [done] = await sql`SELECT 1 FROM pet_meta WHERE key = 'seeded'`;
  if (done) return;

  type Row = { studio: string | null; login: string | null; set: string; sprite: { id: string; src: string; w: number; h: number } };
  const rows: Row[] = [];
  for (const sprite of WALK_SETS[DEFAULT_SET] ?? []) rows.push({ studio: null, login: null, set: DEFAULT_SET, sprite });
  const ownSets: Record<string, string> = {};
  for (const [channel, set] of Object.entries(STREAMER_SETS)) {
    if (set === DEFAULT_SET || !WALK_SETS[set]) continue;
    ownSets[channel] = set;
    for (const sprite of WALK_SETS[set]) rows.push({ studio: channel, login: null, set, sprite });
  }
  const byId = new Map(Object.values(WALK_SETS).flat().map((w) => [w.id, w]));
  for (const [login, id] of Object.entries(CHATTER_SPRITES)) {
    const sprite = byId.get(id);
    if (sprite) rows.push({ studio: null, login, set: id.split("/")[0], sprite });
  }
  // Read everything before taking the lock, so it isn't held across file reads.
  const bytes = new Map<string, Buffer>();
  for (const r of rows) if (!bytes.has(r.sprite.src)) bytes.set(r.sprite.src, await builtInBytes(r.sprite.src));

  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(727274)`;
    const [again] = await tx`SELECT 1 FROM pet_meta WHERE key = 'seeded'`;
    if (again) return;
    const studios = await tx`SELECT id, channel FROM studios`;
    const studioOf = new Map(studios.map((s) => [String(s.channel), Number(s.id)]));
    for (const r of rows) {
      let studioId: number | null = null;
      if (r.studio) {
        const id = studioOf.get(r.studio);
        if (id === undefined) {
          console.warn(`[pets] no studio for #${r.studio}; its own pets weren't copied in`);
          continue;
        }
        studioId = id;
      }
      const name = r.login ? r.sprite.id.split("/").pop()! : `${r.set} · ${r.sprite.id.split("/").pop()}`;
      await tx`
        INSERT INTO pet_sprites (id, studio_id, name, login, w, h, data, created_by)
        VALUES (${crypto.randomBytes(16).toString("hex")}, ${studioId}, ${name}, ${r.login},
                ${r.sprite.w}, ${r.sprite.h}, ${bytes.get(r.sprite.src)!}, 'built-in')
      `;
    }
    for (const channel of Object.keys(ownSets)) {
      await tx`UPDATE studios SET pets_default_mix = false WHERE channel = ${channel}`;
    }
    await tx`INSERT INTO pet_meta (key, value) VALUES ('seeded', ${new Date().toISOString()})`;
  });
}

function toSprite(r: any): PetSprite {
  return {
    id: r.id,
    name: r.name,
    login: r.login ?? null,
    global: r.studio_id == null,
    w: Number(r.w),
    h: Number(r.h),
    createdAt: new Date(r.created_at).toISOString(),
  };
}

/** Width and height from a PNG's header, or null if it isn't a PNG. */
export function pngSize(b: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !sig.every((v, i) => b[i] === v)) return null;
  // The first chunk is always IHDR: width and height, big-endian, at 16 and 20.
  if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== "IHDR") return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

// ---- for the studio ---------------------------------------------------------

/** What a studio's editors see: its own sprites, and the every-chat ones. */
export async function listSprites(studioId: number): Promise<{ sprites: PetSprite[]; defaultMix: boolean }> {
  await seeded();
  const rows = await sql`
    SELECT id, studio_id, name, login, w, h, created_at
    FROM pet_sprites WHERE studio_id = ${studioId} OR studio_id IS NULL
    ORDER BY (studio_id IS NULL), (login IS NULL) DESC, created_at, id
  `;
  const [s] = await sql`SELECT pets_default_mix FROM studios WHERE id = ${studioId}`;
  return { sprites: rows.map(toSprite), defaultMix: s ? Boolean(s.pets_default_mix) : true };
}

export async function setDefaultMix(studioId: number, on: boolean): Promise<void> {
  await ready();
  await sql`UPDATE studios SET pets_default_mix = ${on} WHERE id = ${studioId}`;
}

export type AddResult =
  | { ok: true; sprite: PetSprite }
  | { ok: false; error: "not_png" | "bad_size" | "too_big" | "full" | "bad_login" };

export async function addSprite(
  studioId: number,
  by: string,
  input: { name: unknown; login: unknown; global: boolean; bytes: Uint8Array },
): Promise<AddResult> {
  await seeded();
  const { bytes } = input;
  if (bytes.length > MAX_SPRITE_BYTES) return { ok: false, error: "too_big" };
  const size = pngSize(bytes);
  if (!size) return { ok: false, error: "not_png" };
  // Four equal cells in a row, as lib/spritesheet lays them out.
  if (size.width % 4 !== 0 || size.width / 4 > MAX_CELL || size.height > MAX_CELL || size.height < 8) {
    return { ok: false, error: "bad_size" };
  }
  const rawLogin = String(input.login ?? "").trim();
  const login = rawLogin ? cleanLogin(rawLogin) : null;
  if (rawLogin && !login) return { ok: false, error: "bad_login" };

  const owner = input.global ? null : studioId;
  const rows = await sql`
    INSERT INTO pet_sprites (id, studio_id, name, login, w, h, data, created_by)
    SELECT ${crypto.randomBytes(16).toString("hex")}, ${owner}, ${cleanName(input.name)}, ${login},
           ${size.width / 4}, ${size.height}, ${Buffer.from(bytes)}, ${by}
    WHERE (SELECT count(*) FROM pet_sprites WHERE studio_id IS NOT DISTINCT FROM ${owner}) < ${MAX_SPRITES_PER_STUDIO}
    RETURNING id, studio_id, name, login, w, h, created_at
  `;
  if (!rows[0]) return { ok: false, error: "full" };
  return { ok: true, sprite: toSprite(rows[0]) };
}

/**
 * The sprite, if this studio may change it: one of its own, or (for an
 * admin) an every-chat one.
 */
async function editable(studioId: number, id: string, admin: boolean): Promise<{ global: boolean } | null> {
  const [r] = await sql`SELECT studio_id FROM pet_sprites WHERE id = ${id}`;
  if (!r) return null;
  if (r.studio_id == null) return admin ? { global: true } : null;
  return Number(r.studio_id) === studioId ? { global: false } : null;
}

/** Change its name, who it's given to, or where it applies. Null if it isn't this studio's to change. */
export async function updateSprite(
  studioId: number,
  admin: boolean,
  id: string,
  patch: { name?: unknown; login?: unknown; global?: boolean },
): Promise<PetSprite | "bad_login" | null> {
  await ready();
  if (!(await editable(studioId, id, admin))) return null;
  let login: string | null | undefined;
  if (patch.login !== undefined) {
    const raw = String(patch.login ?? "").trim();
    login = raw ? cleanLogin(raw) : null;
    if (raw && !login) return "bad_login";
  }
  const name = patch.name !== undefined ? cleanName(patch.name) : undefined;
  // Moving it between this chat and every chat is an admin's call.
  const move = patch.global !== undefined && admin;
  const rows = await sql`
    UPDATE pet_sprites SET
      name = COALESCE(${name ?? null}::text, name),
      login = CASE WHEN ${login !== undefined}::boolean THEN ${login ?? null}::text ELSE login END,
      studio_id = CASE WHEN ${move}::boolean THEN ${patch.global ? null : studioId}::bigint ELSE studio_id END
    WHERE id = ${id}
    RETURNING id, studio_id, name, login, w, h, created_at
  `;
  return rows[0] ? toSprite(rows[0]) : null;
}

export async function deleteSprite(studioId: number, admin: boolean, id: string): Promise<boolean> {
  await ready();
  if (!(await editable(studioId, id, admin))) return false;
  const rows = await sql`DELETE FROM pet_sprites WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

// ---- for the pets page --------------------------------------------------------

/** Everything that applies in one streamer's chat: the mix, and chatters' own sprites. */
export async function spritesForChannel(
  channel: string,
): Promise<{ mix: ServedSprite[]; chatters: Record<string, ServedSprite> }> {
  await seeded();
  const rows = await sql`
    SELECT p.id, p.login, p.w, p.h, (p.studio_id IS NOT NULL) AS own
    FROM pet_sprites p
    LEFT JOIN studios s ON s.channel = ${channel}
    WHERE p.studio_id = s.id OR p.studio_id IS NULL
    ORDER BY p.created_at, p.id
  `;
  const served = (r: any): ServedSprite => ({ id: r.id, src: `/api/chatpets/sprite/${r.id}`, w: Number(r.w), h: Number(r.h) });
  const chatters: Record<string, ServedSprite> = {};
  // Every-chat ones first, so this chat's own (written after) win.
  for (const r of rows) if (r.login && !r.own) chatters[r.login] = served(r);
  for (const r of rows) if (r.login && r.own) chatters[r.login] = served(r);
  // A channel nobody has a studio for gets the default mix.
  const [st] = await sql`SELECT pets_default_mix FROM studios WHERE channel = ${channel} LIMIT 1`;
  const useDefault = st ? Boolean(st.pets_default_mix) : true;
  const mix = rows.filter((r) => !r.login && (r.own || useDefault)).map(served);
  return { mix, chatters };
}

export async function spriteImage(id: string): Promise<Uint8Array<ArrayBuffer> | null> {
  await ready();
  const rows = await sql`SELECT data FROM pet_sprites WHERE id = ${id}`;
  return rows[0] ? new Uint8Array(rows[0].data as Buffer) : null;
}
