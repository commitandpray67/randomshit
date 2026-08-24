/**
 * 7TV v3 response parsing, kept separate from the route so it can be tested
 * without network access.
 *
 * Shapes follow the official v3 OpenAPI spec:
 *   GET /v3/users/{platform}/{platform_id}  → in practice a UserConnectionModel
 *       (id, platform, username, emote_set, emote_set_id, user), even though
 *       the spec labels the response UserModel.
 *   GET /v3/users/{id}                      → UserModel: connections[] and
 *       emote_sets[], with NO top-level emote_set.
 *   GET /v3/emote-sets/{id}                 → EmoteSetModel, whose `emotes`
 *       is optional and holds ActiveEmoteModel entries.
 */

export type Emote = { id: string; name: string; url: string };

/** A file entry inside ImageHost.files. */
type HostFile = {
  name?: string;
  format?: string;
  width?: number;
  height?: number;
};

type ImageHost = { url?: string; files?: HostFile[] };

/**
 * ActiveEmoteModel: `id` and `name` are the set's alias (what viewers type),
 * while `data` (EmotePartialModel, nullable) carries the image host.
 */
type ActiveEmote = {
  id?: string;
  name?: string;
  data?: { host?: ImageHost; name?: string } | null;
};

/** host.url is protocol-relative ("//cdn.7tv.app/emote/<id>"). */
function absolute(url: string): string {
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("http://")) return `https://${url.slice(7)}`;
  return url;
}

/**
 * Best image URL for one emote.
 *
 * Prefers the largest WEBP in host.files — a fixed "3x.webp" guess breaks on
 * emotes that were never encoded at 3x, or that only exist as AVIF/GIF/PNG.
 * Falls back to the CDN's conventional path when there's no host block at all.
 */
export function emoteUrl(emote: ActiveEmote): string | null {
  const host = emote?.data?.host;
  const id = emote?.id;

  const files = Array.isArray(host?.files) ? host!.files! : [];
  if (host?.url && files.length) {
    const score = (f: HostFile) => (f.width ?? 0) * (f.height ?? 0);
    const byPreference = (fmt: string) =>
      files
        .filter((f) => (f.format ?? "").toUpperCase() === fmt && f.name)
        .sort((a, b) => score(b) - score(a))[0];

    // WEBP first: broad OBS/CEF support and animation. Then GIF and PNG.
    // AVIF last — older CEF builds, including the one OBS 30 ships, can't
    // decode it, so an AVIF-only emote would render blank on stream.
    const pick =
      byPreference("WEBP") ?? byPreference("GIF") ?? byPreference("PNG") ?? byPreference("AVIF");
    if (pick?.name) return `${absolute(host.url)}/${pick.name}`;
  }

  return id ? `https://cdn.7tv.app/emote/${id}/3x.webp` : null;
}

/** Map an EmoteSetModel's `emotes` (optional) to our shape. */
export function emotesFromSet(set: any): Emote[] {
  const list: ActiveEmote[] = Array.isArray(set?.emotes) ? set.emotes : [];
  return list
    .map((e) => {
      const url = emoteUrl(e);
      if (!e?.id || !url) return null;
      return { id: e.id, name: e.name ?? e.data?.name ?? e.id, url };
    })
    .filter(Boolean) as Emote[];
}

/**
 * Find the emote set on whichever shape came back.
 *
 * Returns the inline set when present (saves a round trip), otherwise an id to
 * fetch. Prefers the Twitch connection: a 7TV account can link several
 * platforms, and taking the first connection blindly — as some clients do —
 * can hand back a YouTube or Kick set instead of the one asked for.
 */
export function findEmoteSet(payload: any): { set?: any; setId?: string } {
  if (!payload || typeof payload !== "object") return {};

  // UserConnectionModel (the /users/twitch/{id} response).
  if (payload.emote_set && Array.isArray(payload.emote_set.emotes)) {
    return { set: payload.emote_set };
  }
  if (payload.emote_set?.id) return { setId: payload.emote_set.id };
  if (payload.emote_set_id) return { setId: payload.emote_set_id };

  // UserModel: look through connections, Twitch first.
  const connections: any[] = Array.isArray(payload.connections) ? payload.connections : [];
  const ordered = [
    ...connections.filter((c) => String(c?.platform ?? "").toUpperCase() === "TWITCH"),
    ...connections.filter((c) => String(c?.platform ?? "").toUpperCase() !== "TWITCH"),
  ];
  for (const c of ordered) {
    if (c?.emote_set && Array.isArray(c.emote_set.emotes)) return { set: c.emote_set };
    if (c?.emote_set?.id) return { setId: c.emote_set.id };
    if (c?.emote_set_id) return { setId: c.emote_set_id };
  }

  // UserModel.emote_sets[] holds EmoteSetPartialModel — id only, no emotes.
  const sets: any[] = Array.isArray(payload.emote_sets) ? payload.emote_sets : [];
  if (sets[0]?.id) return { setId: sets[0].id };

  // Some responses nest the full UserModel under `user`.
  if (payload.user && typeof payload.user === "object") {
    const nested = findEmoteSet(payload.user);
    if (nested.set || nested.setId) return nested;
  }

  return {};
}

/** Pull the exact-match user id out of a GQL SearchUsers response. */
export function pickSearchedUserId(gql: any, username: string): string | null {
  const users = gql?.data?.users;
  if (!Array.isArray(users) || users.length === 0) return null;
  const wanted = username.toLowerCase();
  const exact = users.find((u: any) => String(u?.username ?? "").toLowerCase() === wanted);
  return exact?.id ?? users[0]?.id ?? null;
}
