/**
 * Stream overlay: a Pogly-style OBS browser source for the friends tracker.
 *
 * Pogly (https://github.com/poglyapp) is a real-time collaborative overlay
 * built on SpacetimeDB and shipped as a Docker image, so it can't be vendored
 * into a serverless Next.js app. This is the same idea rebuilt on what we
 * already have: the events table, plus polling. The overlay page renders
 * friend added / unfriended / re-added alerts on stream.
 *
 * Access is gated two ways:
 *   - the control panel at /overlay requires a Steam login whose SteamID is in
 *     POGLY_ALLOWED_STEAM_IDS;
 *   - the overlay page itself is keyed by an unguessable overlay_key, because
 *     an OBS browser source cannot carry a session cookie.
 */
import crypto from "node:crypto";
import { sql } from "./db";

export type OverlayPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export const POSITIONS: OverlayPosition[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

export type OverlayEventType = "added" | "removed" | "readded";

export type OverlayConfig = {
  steamId: string;
  overlayKey: string;
  position: OverlayPosition;
  accent: string;
  showAvatars: boolean;
  anonymize: boolean;
  showAdded: boolean;
  showRemoved: boolean;
  showReadded: boolean;
  maxEvents: number;
  eventTtlSec: number;
  pollSec: number;
};

export type OverlayEvent = {
  id: number;
  type: OverlayEventType;
  name: string | null;
  avatar: string | null;
  at: string;
};

/**
 * How often an overlay poll is allowed to trigger a real Steam fetch.
 *
 * The overlay is the only thing that makes this feature live: the daily cron
 * would surface an unfriend up to 24h late. Each poll asks syncUser to refresh,
 * but syncUser's own DB-backed throttle means only one poll per window actually
 * hits Steam, however fast OBS is polling.
 */
const SYNC_THROTTLE_SEC = Number(process.env.OVERLAY_SYNC_THROTTLE_SEC ?? 60);

/** SteamIDs allowed to use the overlay, from POGLY_ALLOWED_STEAM_IDS. */
export function overlayAllowlist(): string[] {
  return (process.env.POGLY_ALLOWED_STEAM_IDS ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Fail closed: with no allowlist configured nobody gets in, matching how the
 * cron route refuses to run without CRON_SECRET. An empty env var must never
 * mean "everyone".
 */
export function isOverlayAllowed(steamId: string | null): boolean {
  if (!steamId) return false;
  return overlayAllowlist().includes(steamId);
}


export function syncThrottleSec(): number {
  return Number.isFinite(SYNC_THROTTLE_SEC) && SYNC_THROTTLE_SEC >= 0
    ? SYNC_THROTTLE_SEC
    : 60;
}

function newKey(): string {
  // 32 hex chars — unguessable, and safe in a URL path with no escaping.
  return crypto.randomBytes(16).toString("hex");
}

function toConfig(row: any): OverlayConfig {
  return {
    steamId: row.steam_id,
    overlayKey: row.overlay_key,
    position: row.position,
    accent: row.accent,
    showAvatars: row.show_avatars,
    anonymize: row.anonymize,
    showAdded: row.show_added,
    showRemoved: row.show_removed,
    showReadded: row.show_readded,
    maxEvents: row.max_events,
    eventTtlSec: row.event_ttl_sec,
    pollSec: row.poll_sec,
  };
}

/** The user's overlay config, creating one with defaults on first visit. */
export async function ensureOverlayConfig(steamId: string): Promise<OverlayConfig> {
  const rows = await sql`
    INSERT INTO overlay_configs (steam_id, overlay_key)
    VALUES (${steamId}, ${newKey()})
    ON CONFLICT (steam_id) DO UPDATE SET steam_id = EXCLUDED.steam_id
    RETURNING *
  `;
  return toConfig(rows[0]);
}

/** Issue a fresh key, breaking every previously shared browser-source URL. */
export async function rotateOverlayKey(steamId: string): Promise<OverlayConfig> {
  const rows = await sql`
    UPDATE overlay_configs
    SET overlay_key = ${newKey()}, updated_at = now()
    WHERE steam_id = ${steamId}
    RETURNING *
  `;
  if (!rows[0]) return ensureOverlayConfig(steamId);
  return toConfig(rows[0]);
}

/** Look up an overlay by its URL key. Null when the key is unknown/rotated. */
export async function getConfigByKey(key: string): Promise<OverlayConfig | null> {
  if (!key || key.length > 64) return null;
  const rows = await sql`
    SELECT * FROM overlay_configs WHERE overlay_key = ${key}
  `;
  return rows[0] ? toConfig(rows[0]) : null;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** #rgb / #rrggbb only — this value is interpolated into the overlay's CSS. */
function safeAccent(value: unknown, fallback: string): string {
  const s = String(value ?? "").trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s) ? s : fallback;
}

export type OverlaySettingsInput = {
  position?: unknown;
  accent?: unknown;
  showAvatars?: unknown;
  anonymize?: unknown;
  showAdded?: unknown;
  showRemoved?: unknown;
  showReadded?: unknown;
  maxEvents?: unknown;
  eventTtlSec?: unknown;
  pollSec?: unknown;
};

/**
 * Validate and persist settings. Everything is clamped to the same bounds the
 * table's CHECK constraints enforce, so a hand-crafted form post can't get past
 * the UI and trip a database error.
 */
export async function updateOverlaySettings(
  steamId: string,
  input: OverlaySettingsInput,
): Promise<OverlayConfig> {
  const current = await ensureOverlayConfig(steamId);

  const position = POSITIONS.includes(input.position as OverlayPosition)
    ? (input.position as OverlayPosition)
    : current.position;

  const rows = await sql`
    UPDATE overlay_configs SET
      position      = ${position},
      accent        = ${safeAccent(input.accent, current.accent)},
      show_avatars  = ${Boolean(input.showAvatars)},
      anonymize     = ${Boolean(input.anonymize)},
      show_added    = ${Boolean(input.showAdded)},
      show_removed  = ${Boolean(input.showRemoved)},
      show_readded  = ${Boolean(input.showReadded)},
      max_events    = ${clampInt(input.maxEvents, 1, 20, current.maxEvents)},
      event_ttl_sec = ${clampInt(input.eventTtlSec, 3, 3600, current.eventTtlSec)},
      poll_sec      = ${clampInt(input.pollSec, 5, 300, current.pollSec)},
      updated_at    = now()
    WHERE steam_id = ${steamId}
    RETURNING *
  `;
  return toConfig(rows[0]);
}

/** Event types this overlay is configured to show. */
export function enabledTypes(config: OverlayConfig): OverlayEventType[] {
  const types: OverlayEventType[] = [];
  if (config.showAdded) types.push("added");
  if (config.showRemoved) types.push("removed");
  if (config.showReadded) types.push("readded");
  return types;
}

/** The newest event id for this user, used as the overlay's opening baseline. */
export async function latestEventId(steamId: string): Promise<number> {
  const rows = await sql`
    SELECT COALESCE(MAX(id), 0) AS id FROM events WHERE user_steam_id = ${steamId}
  `;
  return Number(rows[0]?.id ?? 0);
}

/**
 * Events newer than `sinceId`, oldest first, filtered to the enabled types.
 * Avatars come from the friends row, which the tracker keeps up to date.
 */
export async function getEventsSince(
  config: OverlayConfig,
  sinceId: number,
): Promise<OverlayEvent[]> {
  const types = enabledTypes(config);
  if (types.length === 0) return [];

  const rows = await sql`
    SELECT e.id, e.type, e.friend_name, e.at, f.avatar
    FROM events e
    LEFT JOIN friends f
      ON f.user_steam_id = e.user_steam_id
     AND f.friend_steam_id = e.friend_steam_id
    WHERE e.user_steam_id = ${config.steamId}
      AND e.id > ${sinceId}
      AND e.type IN ${sql(types)}
    ORDER BY e.id ASC
    LIMIT ${config.maxEvents}
  `;

  return rows.map((r: any) => ({
    id: Number(r.id),
    type: r.type as OverlayEventType,
    // Anonymised overlays must not leak the name or face through the API —
    // strip them server-side rather than trusting the page not to render them.
    name: config.anonymize ? null : (r.friend_name ?? null),
    avatar: config.anonymize || !config.showAvatars ? null : (r.avatar ?? null),
    at: new Date(r.at).toISOString(),
  }));
}
