// Service worker — owns all API calls and two-level cache.
//
// Flow per page load:
//   content.js  →  LOOKUP_NAMES(nicknames)
//   background  →  /api/et/resolve → { nickname: steamId }  (24h cache)
//   background  →  /api/et/lookup  → flag data per steamId  (15min cache)
//   background  →  reply to content.js with { nickname: flagData | null }
//
// Popup flag flow:
//   popup.js  →  RESOLVE_ONE(nickname)  → { steamId, displayName } | null
//   popup.js  →  FLAG({ steamId, displayName, rank, comment })

const API = "https://steamfriends.xyz/api/et";
const RESOLVE_TTL = 24 * 60 * 60 * 1000; // 24 h — matches server cache
const LOOKUP_TTL  = 15 * 60 * 1000;      // 15 min

// In-memory caches (survive until the SW sleeps).
const nameCache  = new Map(); // nickname → { steamId, cachedAt }
const flagCache  = new Map(); // steamId  → { data: obj|null, cachedAt }

// ── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);

async function setup() {
  const { reporterId } = await chrome.storage.local.get("reporterId");
  if (!reporterId) {
    await chrome.storage.local.set({ reporterId: crypto.randomUUID() });
  }
  drawIcon();
}

// ── Message router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
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
  }
});

// ── Core pipeline ────────────────────────────────────────────────────────────

async function lookupNames(nicknames) {
  const now = Date.now();
  const resolved = {};   // nickname → steamId
  const toResolve = [];

  for (const name of nicknames) {
    const hit = nameCache.get(name);
    if (hit && now - hit.cachedAt < RESOLVE_TTL) {
      resolved[name] = hit.steamId;
    } else {
      toResolve.push(name);
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
      }
    } catch { /* network error — use whatever we resolved so far */ }
  }

  // Deduplicate steam IDs, then look up flags in one batch.
  const steamIds = [...new Set(Object.values(resolved).filter(Boolean))];
  const flagData = await lookupSteamIds(steamIds);

  // Map back to nickname → flag data (or null if clean / unresolved).
  const result = {};
  for (const name of nicknames) {
    const steamId = resolved[name];
    result[name] = steamId ? (flagData[steamId] ?? null) : null;
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
      }
    } catch { /* leave uncached */ }
  }

  return result;
}

// ── Popup helpers ─────────────────────────────────────────────────────────────

async function resolveOne(nickname) {
  const name = nickname.trim().toLowerCase();
  const hit = nameCache.get(name);
  if (hit && Date.now() - hit.cachedAt < RESOLVE_TTL) {
    return { steamId: hit.steamId, displayName: nickname };
  }
  try {
    const res = await fetch(`${API}/resolve?names=${encodeURIComponent(name)}`);
    if (res.ok) {
      const { resolved } = await res.json();
      const steamId = resolved[name];
      if (steamId) {
        nameCache.set(name, { steamId, cachedAt: Date.now() });
        return { steamId, displayName: nickname };
      }
    }
  } catch { /* fall through */ }
  return null; // FACEIT account not found or not linked to Steam
}

async function flagPlayer({ steamId, displayName, rank, comment }) {
  const { reporterId } = await chrome.storage.local.get("reporterId");
  try {
    const res = await fetch(`${API}/flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steamId, displayName, rank, comment, reporterId }),
    });
    if (res.ok) {
      const { myFlags = {} } = await chrome.storage.local.get("myFlags");
      myFlags[steamId] = { displayName, rank, comment, addedAt: new Date().toISOString() };
      await chrome.storage.local.set({ myFlags });
      flagCache.delete(steamId);
      return { ok: true };
    }
    return { ok: false };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

async function unflagPlayer(steamId) {
  const { reporterId } = await chrome.storage.local.get("reporterId");
  try {
    const res = await fetch(`${API}/flag`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steamId, reporterId }),
    });
    if (res.ok) {
      const { myFlags = {} } = await chrome.storage.local.get("myFlags");
      delete myFlags[steamId];
      await chrome.storage.local.set({ myFlags });
      flagCache.delete(steamId);
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

async function communitySearch(nickname) {
  const result = await lookupNames([nickname.trim().toLowerCase()]);
  return result[nickname.trim().toLowerCase()] ?? null;
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
