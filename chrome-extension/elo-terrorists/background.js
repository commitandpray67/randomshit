// Service worker — owns all API calls, two-level cache, and FACEIT OAuth.
//
// Cache is persisted to chrome.storage.session so it survives SW sleep/wake
// within a browser session (clears on browser restart, which is fine).
//
// Flags require a valid FACEIT access token; the server verifies identity
// via the FACEIT userinfo endpoint and (when matchId is supplied) checks
// match participation via the FACEIT Data API.

const API = "https://steamfriends.xyz/api/et";
const RESOLVE_TTL = 24 * 60 * 60 * 1000; // 24 h
const LOOKUP_TTL  = 15 * 60 * 1000;       // 15 min

const nameCache = new Map(); // nickname → { steamId, cachedAt }
const flagCache = new Map(); // steamId  → { data: obj|null, cachedAt }

// ── FACEIT OAuth ─────────────────────────────────────────────────────────────

// Public OAuth client id — safe to ship, it travels in the authorize URL.
// Registered at https://developers.faceit.com against the redirect URI from
// chrome.identity.getRedirectURL() (logged to the SW console on install).
// Must match FACEIT_CLIENT_ID in the server env — /api/et/oauth/token exchanges
// the code with the matching secret, and FACEIT ties the registered redirect URI
// to this specific client.
const FACEIT_CLIENT_ID = "c0cc2ccd-d687-4226-aa8f-9787b13abec3";
const FACEIT_AUTH_URL  = "https://accounts.faceit.com/oauth/authorize";
const FACEIT_USER_URL  = "https://api.faceit.com/auth/v1/resources/userinfo";

// FACEIT's token endpoint authenticates with HTTP Basic client_id:client_secret
// and has no public-client mode. The secret cannot live in an extension, so the
// code exchange and refresh are proxied through our own server.
const TOKEN_PROXY_URL = `${API}/oauth/token`;

function genVerifier() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function genChallenge(verifier) {
  const buf = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(verifier)
  );
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function faceitLogin() {
  const verifier    = genVerifier();
  const challenge   = await genChallenge(verifier);
  const state       = crypto.randomUUID();
  const redirectUri = chrome.identity.getRedirectURL();

  const params = new URLSearchParams({
    response_type:         "code",
    client_id:             FACEIT_CLIENT_ID,
    redirect_uri:          redirectUri,
    scope:                 "openid profile",
    state,
    code_challenge:        challenge,
    code_challenge_method: "S256",
    // Without this FACEIT redirects the *parent* page and parks the popup on
    // /post-redirect ("you can close this window"), so launchWebAuthFlow —
    // which has no parent — never sees the redirect and the flow hangs.
    redirect_popup:        "true",
  });

  const authUrl = `${FACEIT_AUTH_URL}?${params}`;

  let responseUrl;
  try {
    responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl, interactive: true },
        (url) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (!url) reject(new Error("No redirect URL returned"));
          else resolve(url);
        }
      );
    });
  } catch (e) {
    console.error("[ET] authorize failed:", e.message);
    return { ok: false, error: `Authorize: ${e.message}` };
  }

  // Never log responseUrl — it carries the single-use authorization code.
  const parsed = new URL(responseUrl);

  // FACEIT reports refusals as ?error=...&error_description=... on the redirect.
  // Surfacing its wording beats a generic failure — this is where a bad
  // redirect_uri, unknown client, or unsupported scope actually explains itself.
  const oauthError = parsed.searchParams.get("error");
  if (oauthError) {
    const desc = parsed.searchParams.get("error_description") || "";
    console.error("[ET] FACEIT refused:", oauthError, desc);
    return { ok: false, error: `FACEIT: ${oauthError}${desc ? ` — ${desc}` : ""}` };
  }

  const code = parsed.searchParams.get("code");
  if (!code) {
    return { ok: false, error: "No authorization code in FACEIT's response" };
  }
  if (parsed.searchParams.get("state") !== state) {
    return { ok: false, error: "State mismatch — possible interference, try again" };
  }

  try {
    const tokenRes = await fetch(TOKEN_PROXY_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType:    "authorization_code",
        code,
        redirectUri,
        codeVerifier: verifier,
      }),
    });
    if (!tokenRes.ok) {
      const detail = await tokenRes.text().catch(() => "");
      throw new Error(`Token exchange ${tokenRes.status}: ${detail}`.trim());
    }
    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error("Token response had no access_token");

    await chrome.storage.local.set({
      faceit_access_token:  tokens.access_token,
      faceit_refresh_token: tokens.refresh_token ?? null,
      faceit_expires_at:    Date.now() + (tokens.expires_in ?? 3600) * 1000,
    });

    // A token we can't identify is useless downstream — the server rejects
    // flags whose userinfo lookup fails, so fail here rather than showing a
    // connected state that cannot actually flag anyone.
    const user = await fetchFaceitUser(tokens.access_token);
    if (!user?.guid) throw new Error("Signed in, but FACEIT userinfo lookup failed");
    await chrome.storage.local.set({ faceit_user: user });

    return { ok: true, user };
  } catch (e) {
    console.error("[ET] token exchange failed:", e.message);
    return { ok: false, error: e.message };
  }
}

async function faceitLogout() {
  await chrome.storage.local.remove([
    "faceit_access_token", "faceit_refresh_token",
    "faceit_expires_at",   "faceit_user",
  ]);
  return { ok: true };
}

async function getAuthStatus() {
  const { faceit_user, faceit_access_token, faceit_expires_at } =
    await chrome.storage.local.get(["faceit_user", "faceit_access_token", "faceit_expires_at"]);
  if (!faceit_access_token) return { authenticated: false, user: null };
  const expired = faceit_expires_at && Date.now() > faceit_expires_at - 60_000;
  if (expired && !(await refreshAccessToken())) return { authenticated: false, user: null };
  return { authenticated: true, user: faceit_user ?? null };
}

async function getValidToken() {
  const { faceit_access_token, faceit_expires_at } =
    await chrome.storage.local.get(["faceit_access_token", "faceit_expires_at"]);
  if (!faceit_access_token) return null;
  if (!faceit_expires_at || Date.now() < faceit_expires_at - 60_000) return faceit_access_token;
  return (await refreshAccessToken()) ? (await chrome.storage.local.get("faceit_access_token")).faceit_access_token : null;
}

async function refreshAccessToken() {
  const { faceit_refresh_token } = await chrome.storage.local.get("faceit_refresh_token");
  if (!faceit_refresh_token) return false;
  try {
    const res = await fetch(TOKEN_PROXY_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType:    "refresh_token",
        refreshToken: faceit_refresh_token,
      }),
    });
    if (!res.ok) return false;
    const tokens = await res.json();
    await chrome.storage.local.set({
      faceit_access_token:  tokens.access_token,
      faceit_refresh_token: tokens.refresh_token ?? faceit_refresh_token,
      faceit_expires_at:    Date.now() + (tokens.expires_in ?? 3600) * 1000,
    });
    return true;
  } catch {
    return false;
  }
}

async function fetchFaceitUser(accessToken) {
  try {
    const res = await fetch(FACEIT_USER_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    // FACEIT OIDC returns { sub, nickname, ... }
    return { guid: data.sub ?? data.guid, nickname: data.nickname };
  } catch {
    return null;
  }
}

// ── Session-persistent cache ─────────────────────────────────────────────────

async function loadCaches() {
  try {
    const { _nc, _fc } = await chrome.storage.session.get(["_nc", "_fc"]);
    if (_nc) for (const [k, v] of Object.entries(_nc)) nameCache.set(k, v);
    if (_fc) for (const [k, v] of Object.entries(_fc)) flagCache.set(k, v);
  } catch { /* storage.session unavailable in older Chrome */ }
}

async function saveNameCache() {
  try { await chrome.storage.session.set({ _nc: Object.fromEntries(nameCache) }); } catch {}
}

async function saveFlagCache() {
  try { await chrome.storage.session.set({ _fc: Object.fromEntries(flagCache) }); } catch {}
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  await loadCaches();
  console.log("[ELO TERRORISTS] FACEIT redirect URI:", chrome.identity.getRedirectURL());
  drawIcon();
});

chrome.runtime.onStartup.addListener(async () => {
  await loadCaches();
  drawIcon();
});

// ── Message router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  switch (msg.type) {
    case "LOOKUP_NAMES":
      lookupNames(msg.names).then(reply);
      return true;
    case "RESOLVE_ONE":
      resolveOne(msg.nickname).then(reply);
      return true;
    case "FLAG":
      flagPlayer(msg).then(reply);
      return true;
    case "UNFLAG":
      unflagPlayer(msg.steamId).then(reply);
      return true;
    case "MY_FLAGS":
      getMyFlags().then(reply);
      return true;
    case "COMMUNITY_SEARCH":
      communitySearch(msg.nickname).then(reply);
      return true;
    case "FACEIT_LOGIN":
      faceitLogin().then(reply);
      return true;
    case "FACEIT_LOGOUT":
      faceitLogout().then(reply);
      return true;
    case "GET_AUTH_STATUS":
      getAuthStatus().then(reply);
      return true;
    case "SET_BADGE": {
      const tabId = sender.tab?.id;
      if (tabId != null) {
        chrome.action.setBadgeBackgroundColor({ color: "#cc0000", tabId });
        chrome.action.setBadgeText({
          text: msg.count > 0 ? String(msg.count) : "",
          tabId,
        });
      }
      return false;
    }
  }
});

// ── Core pipeline ────────────────────────────────────────────────────────────

// Accepts nicknames in their original casing (FACEIT's lookup is exact-match).
// Returns { lowercaseNickname: { data: flagObj|null, steamId: string|null } }.
async function lookupNames(nicknames) {
  const now = Date.now();
  const resolved = {};   // lowercase key → steamId
  const toResolve = [];  // original casing, sent to the API

  for (const original of nicknames) {
    const key = original.trim().toLowerCase();
    const hit = nameCache.get(key);
    if (hit && now - hit.cachedAt < RESOLVE_TTL) {
      resolved[key] = hit.steamId;
    } else {
      toResolve.push(original);
    }
  }

  if (toResolve.length > 0) {
    try {
      const qs = toResolve.map(encodeURIComponent).join(",");
      const res = await fetch(`${API}/resolve?names=${qs}`);
      if (res.ok) {
        const { resolved: fresh } = await res.json();
        for (const [name, steamId] of Object.entries(fresh)) {
          nameCache.set(name, { steamId, cachedAt: Date.now() });
          resolved[name] = steamId;
        }
        await saveNameCache();
      }
    } catch { /* network error */ }
  }

  const steamIds = [...new Set(Object.values(resolved).filter(Boolean))];
  const flagData = await lookupSteamIds(steamIds);

  const result = {};
  for (const original of nicknames) {
    const key = original.trim().toLowerCase();
    const steamId = resolved[key] ?? null;
    result[key] = { data: steamId ? (flagData[steamId] ?? null) : null, steamId };
  }
  return result;
}

async function lookupSteamIds(steamIds) {
  if (!steamIds.length) return {};

  const now = Date.now();
  const result = {};
  const toFetch = [];

  for (const id of steamIds) {
    const hit = flagCache.get(id);
    if (hit && now - hit.cachedAt < LOOKUP_TTL) {
      result[id] = hit.data;
    } else {
      toFetch.push(id);
    }
  }

  if (toFetch.length > 0) {
    try {
      const qs = toFetch.map(encodeURIComponent).join(",");
      const res = await fetch(`${API}/lookup?steam_ids=${qs}`);
      if (res.ok) {
        const { terrorists } = await res.json();
        const byId = Object.fromEntries(terrorists.map((t) => [t.steam_id, t]));
        for (const id of toFetch) {
          const data = byId[id] ?? null;
          flagCache.set(id, { data, cachedAt: Date.now() });
          result[id] = data;
        }
        await saveFlagCache();
      }
    } catch { /* leave uncached */ }
  }

  return result;
}

// ── Popup helpers ─────────────────────────────────────────────────────────────

async function resolveOne(nickname) {
  const original = nickname.trim();
  const key = original.toLowerCase();
  const hit = nameCache.get(key);
  if (hit && Date.now() - hit.cachedAt < RESOLVE_TTL) {
    return { steamId: hit.steamId, displayName: original };
  }
  try {
    // Send original casing — the server keys the response by lowercase.
    const res = await fetch(`${API}/resolve?names=${encodeURIComponent(original)}`);
    if (res.ok) {
      const { resolved } = await res.json();
      const steamId = resolved[key];
      if (steamId) {
        nameCache.set(key, { steamId, cachedAt: Date.now() });
        await saveNameCache();
        return { steamId, displayName: original };
      }
    }
  } catch { /* fall through */ }
  return null;
}

async function flagPlayer({ steamId, displayName, rank, comment, matchId }) {
  const token = await getValidToken();
  if (!token) return { ok: false, error: "Not connected to FACEIT" };

  try {
    const res = await fetch(`${API}/flag`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        steamId, displayName, rank, comment,
        faceitAccessToken: token,
        matchId: matchId ?? null,
      }),
    });
    if (res.ok) {
      const { myFlags = {} } = await chrome.storage.local.get("myFlags");
      myFlags[steamId] = { displayName, rank, comment, addedAt: new Date().toISOString() };
      await chrome.storage.local.set({ myFlags });
      flagCache.delete(steamId);
      await saveFlagCache();
      return { ok: true };
    }
    const text = await res.text().catch(() => "");
    return { ok: false, error: text || String(res.status) };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

async function unflagPlayer(steamId) {
  const token = await getValidToken();
  if (!token) return { ok: false, error: "Not connected to FACEIT" };

  try {
    const res = await fetch(`${API}/flag`, {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steamId, faceitAccessToken: token }),
    });
    if (res.ok) {
      const { myFlags = {} } = await chrome.storage.local.get("myFlags");
      delete myFlags[steamId];
      await chrome.storage.local.set({ myFlags });
      flagCache.delete(steamId);
      await saveFlagCache();
      return { ok: true };
    }
    return { ok: false };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

async function getMyFlags() {
  const { myFlags = {} } = await chrome.storage.local.get("myFlags");
  return myFlags;
}

// Returns { resolved, data }. `resolved` distinguishes "this nickname does not
// exist on FACEIT / has no linked Steam account" from "this player is clean" —
// collapsing both to null previously made unknown players look reported-free.
async function communitySearch(nickname) {
  const original = nickname.trim();
  const key = original.toLowerCase();
  const result = await lookupNames([original]);
  const entry = result[key];
  return { resolved: !!entry?.steamId, data: entry?.data ?? null };
}

// ── Icon ─────────────────────────────────────────────────────────────────────

function drawIcon() {
  try {
    const s = 128;
    const canvas = new OffscreenCanvas(s, s);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, s, s);
    ctx.shadowColor = "#ff3333";
    ctx.shadowBlur = s * 0.2;
    ctx.fillStyle = "#ff3333";
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.floor(s * 0.34)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ET", s / 2, s / 2);
    chrome.action.setIcon({ imageData: ctx.getImageData(0, 0, s, s) });
  } catch { /* OffscreenCanvas unavailable */ }
}
