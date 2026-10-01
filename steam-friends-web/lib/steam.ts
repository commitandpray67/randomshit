/**
 * Steam integration: OpenID 2.0 login + Web API friend fetching.
 *
 * Steam only supports the (old) OpenID 2.0 spec — not OAuth/OIDC. Login proves
 * identity and yields the user's SteamID64; it does NOT grant access to private
 * data. Reading a friends list still requires your own API key AND the target
 * profile's friends list being set to Public.
 */

const OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const API_BASE = "https://api.steampowered.com";

/**
 * Where a login may send you afterwards, by name.
 *
 * `/api/auth/steam?to=<name>` remembers the name in a short-lived cookie and
 * the return route looks it up here. A fixed list rather than "any path on this
 * site": the value comes from a query string anyone can craft, and accepting
 * paths invites the usual tricks (`//evil.example`, `/\evil.example`, encoded
 * variants) that turn a login link into an open redirect. A Map rather than an
 * object literal, so names like `constructor` find nothing.
 */
const AFTER_LOGIN = new Map<string, string>([
  ["jayc", "/jayc"],
  ["studio", "/studio"],
  ["overlay", "/overlay"],
]);

/** The path for a known name, or null — the caller then uses the dashboard. */
export function afterLogin(name: string | null | undefined): string | null {
  return (name && AFTER_LOGIN.get(name)) || null;
}

/** Build the URL to send the user to for "Sign in through Steam". */
export function buildLoginUrl(appUrl: string): string {
  const returnTo = `${appUrl}/api/auth/steam/return`;
  const params = new URLSearchParams({
    "openid.ns": OPENID_NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": appUrl,
    "openid.identity": IDENTIFIER_SELECT,
    "openid.claimed_id": IDENTIFIER_SELECT,
  });
  return `${OPENID_ENDPOINT}?${params.toString()}`;
}

/**
 * Verify the OpenID response Steam redirected back with. Returns the verified
 * SteamID64, or null if verification fails. We must re-send the parameters to
 * Steam with mode=check_authentication and trust only its "is_valid:true".
 */
export async function verifyLogin(query: URLSearchParams): Promise<string | null> {
  // Reflect back every openid.* param, swapping mode to check_authentication.
  const body = new URLSearchParams();
  for (const [key, value] of query.entries()) {
    if (key.startsWith("openid.")) body.set(key, value);
  }
  body.set("openid.mode", "check_authentication");

  const res = await fetch(OPENID_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!/is_valid\s*:\s*true/.test(text)) return null;

  // The verified identity URL must be a genuine Steam identity URL, e.g.
  // https://steamcommunity.com/openid/id/7656119XXXXXXXXXX — anchor the host
  // so a signed-but-oddly-shaped claimed_id can't slip a bad id through.
  const claimed = query.get("openid.claimed_id") ?? "";
  const match = claimed.match(
    /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/,
  );
  return match ? match[1] : null;
}

export type PlayerSummary = {
  steamid: string;
  personaname: string;
  profileurl: string;
  avatar: string;
  /** Steam's communityvisibilitystate: 3 = public, else limited/private. */
  communityvisibilitystate: number;
};

export async function getPlayerSummaries(
  steamIds: string[],
): Promise<Map<string, PlayerSummary>> {
  const key = requireApiKey();
  const out = new Map<string, PlayerSummary>();
  for (let i = 0; i < steamIds.length; i += 100) {
    const batch = steamIds.slice(i, i + 100);
    const url = `${API_BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${batch.join(",")}`;
    const data = await fetchJson(url);
    for (const p of data?.response?.players ?? []) {
      out.set(p.steamid, {
        steamid: p.steamid,
        personaname: p.personaname ?? "",
        profileurl: p.profileurl ?? "",
        avatar: p.avatarfull ?? p.avatar ?? "",
        communityvisibilitystate: p.communityvisibilitystate ?? 0,
      });
    }
  }
  return out;
}

/** A SteamID64: 17 digits, and every individual account's starts like this. */
const STEAMID64 = /^7656119\d{10}$/;

/**
 * Turn whatever someone pasted into a SteamID64, or null.
 *
 * Takes the ID itself, a profile link (`steamcommunity.com/profiles/<id>`), or
 * a custom one (`steamcommunity.com/id/<name>`, or just `<name>`), which only
 * Steam can map to an ID. People copy whichever their browser shows, and
 * asking them to dig out the number is how the wrong account gets added.
 */
export async function resolveSteamId(input: string): Promise<string | null> {
  const raw = input.trim().replace(/\/+$/, "");
  if (!raw || raw.length > 200) return null;
  if (STEAMID64.test(raw)) return raw;

  const profiles = raw.match(/steamcommunity\.com\/profiles\/(\d+)/i);
  if (profiles) return STEAMID64.test(profiles[1]) ? profiles[1] : null;

  const custom = raw.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
  const vanity = custom ? custom[1] : raw;
  if (!/^[\w-]{2,64}$/.test(vanity)) return null;

  const key = requireApiKey();
  const data = await fetchJson(
    `${API_BASE}/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${encodeURIComponent(vanity)}`,
  );
  const id = data?.response?.success === 1 ? String(data.response.steamid ?? "") : "";
  return STEAMID64.test(id) ? id : null;
}

export type FriendRef = { steamid: string; friendSince: number };

/**
 * Fetch a user's friend list. Throws { code: "private" } if Steam refuses
 * because the list isn't public (a very common case worth handling in the UI).
 */
export async function getFriendList(steamId: string): Promise<FriendRef[]> {
  const key = requireApiKey();
  const url = `${API_BASE}/ISteamUser/GetFriendList/v1/?key=${key}&steamid=${steamId}&relationship=friend`;
  const res = await fetch(url);
  if (res.status === 401 || res.status === 403) {
    throw { code: "private", message: "Friends list is private or inaccessible." };
  }
  if (!res.ok) {
    throw { code: "http", message: `Steam API error ${res.status}` };
  }
  const data = await res.json();
  const friends = data?.friendslist?.friends ?? [];
  return friends.map((f: any) => ({
    steamid: f.steamid as string,
    friendSince: Number(f.friend_since ?? 0),
  }));
}

function requireApiKey(): string {
  const key = process.env.STEAM_API_KEY;
  if (!key) throw new Error("STEAM_API_KEY is not set.");
  return key;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam API error ${res.status}`);
  return res.json();
}
