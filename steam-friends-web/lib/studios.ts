/**
 * Studios: one canvas per streamer, and who may edit which.
 *
 * The studio began as Juntella's: one shared canvas, owned by the first SteamID
 * in POGLY_ALLOWED_STEAM_IDS and edited by everyone on that list. Now there can
 * be several. Each studio has a canvas (its own scene, so its own OBS link), a
 * Twitch channel (the stream preview behind the canvas, and whose 7TV emotes the
 * picker opens on), and a list of members who may edit it.
 *
 * Admins (STUDIO_ADMIN_STEAM_IDS) see every studio, create new ones and manage
 * their members. Everyone else sees only the studios they're a member of, and
 * any other studio is simply not found, so its existence isn't advertised.
 *
 * The tables live with the scenes (studioSql) and create themselves on first
 * use. Juntella's studio is created then too, from the canvas everyone has been
 * editing, with the old allowlist as its members, so nobody's OBS link or
 * access changes.
 */
import { studioSql as sql } from "./db";
import { overlayAllowlist } from "./overlay";
import { createStudioScene, getSceneForUser } from "./scene";

export type Studio = {
  id: number;
  slug: string;
  name: string;
  /** Twitch channel: the stream preview, and the 7TV picker's default. */
  channel: string | null;
  sceneId: number;
  sceneKey: string;
};

export type Member = { steamId: string; addedAt: string };

function idList(v: string | undefined): string[] {
  return (v ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function studioAdmins(): string[] {
  return idList(process.env.STUDIO_ADMIN_STEAM_IDS);
}

export function isStudioAdmin(steamId: string | null | undefined): boolean {
  return Boolean(steamId) && studioAdmins().includes(steamId as string);
}

/** A Twitch login, which is also the studio's address: /studio/<slug>. */
const CHANNEL = /^[a-z0-9_]{2,25}$/;

export function isStudioSlug(s: unknown): s is string {
  return typeof s === "string" && CHANNEL.test(s);
}

// ---- one-time setup, and a short memory ------------------------------------

/**
 * Who can see what, remembered briefly. Asked on every request — including
 * the twenty-a-second drag path — and it changes only when an admin changes
 * it, which forgets it at once (see forgetStudios). The time limit only covers
 * changes made some other way.
 */
const CACHE_MS = 30_000;

type State = {
  ready: Promise<void> | null;
  cache: Map<string, { at: number; studios: Studio[] }>;
};

// globalThis rather than module state, for the same reason as lib/live.ts: the
// route that changes membership and the route that checks it are bundled
// separately, and must see one cache.
const G = globalThis as typeof globalThis & { __studios?: State };
const S: State = (G.__studios ??= { ready: null, cache: new Map() });

export function forgetStudios(): void {
  S.cache.clear();
}

function ready(): Promise<void> {
  if (!S.ready) {
    S.ready = setup().catch((err) => {
      S.ready = null; // try again on the next request
      throw err;
    });
  }
  return S.ready;
}

async function setup(): Promise<void> {
  // One round trip; nothing in it comes from a request.
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS studios (
      id         BIGSERIAL PRIMARY KEY,
      slug       TEXT NOT NULL UNIQUE,
      name       TEXT NOT NULL,
      channel    TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS studio_members (
      studio_id  BIGINT NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
      steam_id   TEXT NOT NULL,
      added_by   TEXT,
      added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (studio_id, steam_id)
    );
    CREATE INDEX IF NOT EXISTS studio_members_steam_idx ON studio_members (steam_id);
    ALTER TABLE scenes ADD COLUMN IF NOT EXISTS studio_id BIGINT REFERENCES studios(id) ON DELETE SET NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS scenes_studio_idx ON scenes (studio_id) WHERE studio_id IS NOT NULL;
  `);
  await adoptOriginalStudio();
}

/**
 * The studio as it was before there could be several: the canvas owned by the
 * first SteamID in POGLY_ALLOWED_STEAM_IDS, edited by everyone on that list.
 *
 * Runs once, while there are no studios at all. The canvas keeps its id and
 * key, so OBS links don't change; the list becomes its members (admins are
 * left off, since they can open every studio anyway).
 */
async function adoptOriginalStudio(): Promise<void> {
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM studios`;
  if (n > 0) return;
  const allow = overlayAllowlist();
  if (allow.length === 0) return;

  const channel = (process.env.STUDIO_PREVIEW_CHANNEL || process.env.SEVENTV_DEFAULT_CHANNEL || "")
    .trim()
    .toLowerCase();
  const slug = CHANNEL.test(channel) ? channel : "studio";
  const name = CHANNEL.test(channel) ? channel[0].toUpperCase() + channel.slice(1) : "Studio";
  const canvas = await getSceneForUser(allow[0]);
  const admins = new Set(studioAdmins());

  await sql.begin(async (tx) => {
    const [st] = await tx`
      INSERT INTO studios (slug, name, channel) VALUES (${slug}, ${name}, ${CHANNEL.test(channel) ? channel : null})
      ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
      RETURNING id
    `;
    if (canvas) {
      await tx`UPDATE scenes SET studio_id = ${st.id} WHERE id = ${canvas.id} AND studio_id IS NULL`;
    }
    for (const id of allow) {
      if (admins.has(id)) continue;
      await tx`
        INSERT INTO studio_members (studio_id, steam_id, added_by)
        VALUES (${st.id}, ${id}, 'POGLY_ALLOWED_STEAM_IDS')
        ON CONFLICT DO NOTHING
      `;
    }
  });
}

// ---- who sees what ---------------------------------------------------------

/**
 * Every studio this person may open, oldest first: all of them for an admin,
 * otherwise the ones they're a member of.
 */
export async function studiosFor(steamId: string): Promise<Studio[]> {
  const hit = S.cache.get(steamId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.studios;

  await ready();
  const rows = isStudioAdmin(steamId)
    ? await sql`
        SELECT s.id, s.slug, s.name, s.channel, sc.id AS scene_id, sc.scene_key
        FROM studios s LEFT JOIN scenes sc ON sc.studio_id = s.id
        ORDER BY s.id
      `
    : await sql`
        SELECT s.id, s.slug, s.name, s.channel, sc.id AS scene_id, sc.scene_key
        FROM studios s
        JOIN studio_members m ON m.studio_id = s.id AND m.steam_id = ${steamId}
        LEFT JOIN scenes sc ON sc.studio_id = s.id
        ORDER BY s.id
      `;

  const studios: Studio[] = [];
  for (const r of rows) {
    // A studio whose canvas doesn't exist yet gets one the first time someone
    // who may edit it looks.
    const scene = r.scene_id
      ? { id: Number(r.scene_id), sceneKey: r.scene_key as string }
      : await createStudioScene(Number(r.id), steamId);
    studios.push({
      id: Number(r.id),
      slug: r.slug,
      name: r.name,
      channel: r.channel ?? null,
      sceneId: scene.id,
      sceneKey: scene.sceneKey,
    });
  }
  S.cache.set(steamId, { at: Date.now(), studios });
  return studios;
}

/**
 * The studio this person asked for, if they may open it — or, asking for none,
 * the first one they may. Null means no access, or no such studio; callers
 * shouldn't tell the two apart.
 */
export async function studioFor(steamId: string, slug?: string | null): Promise<Studio | null> {
  const studios = await studiosFor(steamId);
  if (!slug) return studios[0] ?? null;
  return studios.find((s) => s.slug === slug) ?? null;
}

// ---- managing them (admins only; callers check) ----------------------------

export type CreateResult = { ok: true; studio: Studio } | { ok: false; error: "bad_channel" | "exists" };

/** A new studio with an empty canvas. Only its creator, an admin, can see it. */
export async function createStudio(
  by: string,
  input: { channel: unknown; name?: unknown },
): Promise<CreateResult> {
  await ready();
  const channel = String(input.channel ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!CHANNEL.test(channel)) return { ok: false, error: "bad_channel" };
  const name = String(input.name ?? "").trim().slice(0, 40) || channel;

  const rows = await sql`
    INSERT INTO studios (slug, name, channel) VALUES (${channel}, ${name}, ${channel})
    ON CONFLICT (slug) DO NOTHING
    RETURNING id
  `;
  if (!rows[0]) return { ok: false, error: "exists" };
  const scene = await createStudioScene(Number(rows[0].id), by);
  forgetStudios();
  return {
    ok: true,
    studio: { id: Number(rows[0].id), slug: channel, name, channel, sceneId: scene.id, sceneKey: scene.sceneKey },
  };
}

export async function listMembers(studioId: number): Promise<Member[]> {
  await ready();
  const rows = await sql`
    SELECT steam_id, added_at FROM studio_members WHERE studio_id = ${studioId} ORDER BY added_at, steam_id
  `;
  return rows.map((r) => ({ steamId: r.steam_id, addedAt: new Date(r.added_at).toISOString() }));
}

export async function addMember(studioId: number, steamId: string, by: string): Promise<void> {
  await ready();
  await sql`
    INSERT INTO studio_members (studio_id, steam_id, added_by) VALUES (${studioId}, ${steamId}, ${by})
    ON CONFLICT DO NOTHING
  `;
  forgetStudios();
}

export async function removeMember(studioId: number, steamId: string): Promise<void> {
  await ready();
  await sql`DELETE FROM studio_members WHERE studio_id = ${studioId} AND steam_id = ${steamId}`;
  forgetStudios();
}
