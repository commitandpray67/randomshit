/**
 * Chat pet sprites uploaded in the studio, rather than built into the app
 * (app/chatpets/sprites). They take effect without a rebuild: the pets page
 * asks for them when it loads and again every minute.
 *
 * A sprite belongs to a studio, which is to say to a streamer's chat, and is
 * either given to one chatter by their Twitch login, or added to the mix that
 * everyone else in that chat is picked from. An admin can also give one to a
 * chatter in every streamer's chat (`everywhere`).
 *
 * Who gets what, for a chatter in some streamer's chat, first match wins:
 *   1. a sprite given to them in this streamer's studio
 *   2. one given to them everywhere
 *   3. one built into the app for them (app/chatpets/pets.ts)
 *   4. a pick from this streamer's mix: the built-in set plus its uploads
 *
 * The strips are cut and laid out in the uploader's browser, from the same
 * rules as the built-in ones (lib/spritesheet.ts); what's stored is the
 * finished PNG. It's checked to be one, and of a sane size, but not decoded.
 *
 * Stored in the studio's own database, as bytea, like the sound library — the
 * nightly backup covers them. The table creates itself on first use.
 */
import crypto from "node:crypto";
import { studioSql as sql } from "./db";

export const MAX_SPRITE_BYTES = 2 * 1024 * 1024;
export const MAX_SPRITES_PER_STUDIO = 300;
/** Largest cell either way, in px. Built-in strips are about 250×160. */
const MAX_CELL = 800;

const LOGIN = /^[a-z0-9_]{1,25}$/;

export function cleanLogin(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase().replace(/^@/, "");
  return LOGIN.test(s) ? s : null;
}

export function isSpriteId(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{32}$/.test(s);
}

export type PetSprite = {
  id: string;
  name: string;
  /** Twitch login it's given to; null means it's in the streamer's mix. */
  login: string | null;
  everywhere: boolean;
  /** One cell of the strip, in px. */
  w: number;
  h: number;
  createdAt: string;
};

/** As the pets page uses them: where to load the strip from, and its cell size. */
export type ServedSprite = { id: string; src: string; w: number; h: number };

const G = globalThis as typeof globalThis & { __petSpritesReady?: Promise<void> | null };

function ready(): Promise<void> {
  if (!G.__petSpritesReady) {
    G.__petSpritesReady = sql
      .unsafe(`
        CREATE TABLE IF NOT EXISTS pet_sprites (
          id          TEXT PRIMARY KEY,
          studio_id   BIGINT NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
          name        TEXT NOT NULL,
          login       TEXT,
          everywhere  BOOLEAN NOT NULL DEFAULT false,
          w           INT NOT NULL,
          h           INT NOT NULL,
          data        BYTEA NOT NULL,
          created_by  TEXT,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS pet_sprites_studio_idx ON pet_sprites (studio_id, created_at);
        CREATE INDEX IF NOT EXISTS pet_sprites_everywhere_idx ON pet_sprites (login) WHERE everywhere;
      `)
      .then(() => undefined)
      .catch((err) => {
        G.__petSpritesReady = null;
        throw err;
      });
  }
  return G.__petSpritesReady;
}

/** Nobody has uploaded anything yet, so there is no table: nothing to find. */
function noTable(err: any): boolean {
  return err?.code === "42P01";
}

function toSprite(r: any): PetSprite {
  return {
    id: r.id,
    name: r.name,
    login: r.login ?? null,
    everywhere: Boolean(r.everywhere),
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

export async function listSprites(studioId: number): Promise<PetSprite[]> {
  await ready();
  const rows = await sql`
    SELECT id, name, login, everywhere, w, h, created_at
    FROM pet_sprites WHERE studio_id = ${studioId}
    ORDER BY created_at DESC, id
  `;
  return rows.map(toSprite);
}

export type AddResult =
  | { ok: true; sprite: PetSprite }
  | { ok: false; error: "not_png" | "bad_size" | "too_big" | "full" | "bad_login" };

export async function addSprite(
  studioId: number,
  by: string,
  input: { name: unknown; login: unknown; everywhere: boolean; bytes: Uint8Array },
): Promise<AddResult> {
  await ready();
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

  const name = String(input.name ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40) || "Pet";
  const id = crypto.randomBytes(16).toString("hex");
  const rows = await sql`
    INSERT INTO pet_sprites (id, studio_id, name, login, everywhere, w, h, data, created_by)
    SELECT ${id}, ${studioId}, ${name}, ${login}, ${Boolean(login) && input.everywhere},
           ${size.width / 4}, ${size.height}, ${Buffer.from(bytes)}, ${by}
    WHERE (SELECT count(*) FROM pet_sprites WHERE studio_id = ${studioId}) < ${MAX_SPRITES_PER_STUDIO}
    RETURNING id, name, login, everywhere, w, h, created_at
  `;
  if (!rows[0]) return { ok: false, error: "full" };
  return { ok: true, sprite: toSprite(rows[0]) };
}

/** Change who it's given to, or its name. Returns null if there's no such sprite here. */
export async function updateSprite(
  studioId: number,
  id: string,
  patch: { name?: unknown; login?: unknown; everywhere?: boolean },
): Promise<PetSprite | "bad_login" | null> {
  await ready();
  let login: string | null | undefined;
  if (patch.login !== undefined) {
    const raw = String(patch.login ?? "").trim();
    login = raw ? cleanLogin(raw) : null;
    if (raw && !login) return "bad_login";
  }
  const name =
    patch.name !== undefined
      ? String(patch.name ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40) || "Pet"
      : undefined;
  const rows = await sql`
    UPDATE pet_sprites SET
      name = COALESCE(${name ?? null}::text, name),
      login = CASE WHEN ${login !== undefined}::boolean THEN ${login ?? null}::text ELSE login END,
      everywhere = CASE
        WHEN ${patch.everywhere !== undefined}::boolean THEN ${Boolean(patch.everywhere)}::boolean
        ELSE everywhere END
    WHERE id = ${id} AND studio_id = ${studioId}
    RETURNING id, name, login, everywhere, w, h, created_at
  `;
  if (!rows[0]) return null;
  // Only a sprite given to someone can be everywhere: the mix is per streamer.
  if (!rows[0].login && rows[0].everywhere) {
    await sql`UPDATE pet_sprites SET everywhere = false WHERE id = ${id}`;
    rows[0].everywhere = false;
  }
  return toSprite(rows[0]);
}

export async function deleteSprite(studioId: number, id: string): Promise<boolean> {
  await ready();
  const rows = await sql`DELETE FROM pet_sprites WHERE id = ${id} AND studio_id = ${studioId} RETURNING id`;
  return rows.length > 0;
}

// ---- for the pets page --------------------------------------------------------

/**
 * Everything uploaded that applies in one streamer's chat: their mix, and the
 * chatters with a sprite of their own (theirs over everywhere ones).
 */
export async function spritesForChannel(
  channel: string,
): Promise<{ mix: ServedSprite[]; chatters: Record<string, ServedSprite> }> {
  const out = { mix: [] as ServedSprite[], chatters: {} as Record<string, ServedSprite> };
  let rows;
  try {
    rows = await sql`
      SELECT p.id, p.login, p.everywhere, p.w, p.h, (p.studio_id = s.id) AS own, p.created_at
      FROM pet_sprites p
      LEFT JOIN studios s ON s.channel = ${channel}
      WHERE p.studio_id = s.id OR (p.everywhere AND p.login IS NOT NULL)
      ORDER BY p.created_at, p.id
    `;
  } catch (err) {
    if (noTable(err)) return out;
    throw err;
  }
  const served = (r: any): ServedSprite => ({ id: r.id, src: `/api/chatpets/sprite/${r.id}`, w: Number(r.w), h: Number(r.h) });
  // Everywhere ones first, so this streamer's own (written after) win.
  for (const r of rows.filter((r) => r.login && !r.own)) out.chatters[r.login] = served(r);
  for (const r of rows.filter((r) => r.login && r.own)) out.chatters[r.login] = served(r);
  out.mix = rows.filter((r) => !r.login && r.own).map(served);
  return out;
}

export async function spriteImage(id: string): Promise<Uint8Array<ArrayBuffer> | null> {
  let rows;
  try {
    rows = await sql`SELECT data FROM pet_sprites WHERE id = ${id}`;
  } catch (err) {
    if (noTable(err)) return null;
    throw err;
  }
  return rows[0] ? new Uint8Array(rows[0].data as Buffer) : null;
}
