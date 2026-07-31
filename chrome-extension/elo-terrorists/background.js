// Service worker — owns all API calls and two-level cache.
//
// Cache is persisted to chrome.storage.session so it survives SW sleep/wake
// within a browser session (clears on browser restart, which is fine).
//
// LOOKUP_NAMES response shape changed to { nickname: { data, steamId } }
// so content.js can offer the inline flag panel without a second round-trip.

const API = "https://steamfriends.xyz/api/et";
const RESOLVE_TTL = 24 * 60 * 60 * 1000; // 24 h
const LOOKUP_TTL  = 15 * 60 * 1000;       // 15 min

const nameCache = new Map(); // nickname → { steamId, cachedAt }
const flagCache = new Map(); // steamId  → { data: obj|null, cachedAt }

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

chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);

async function setup() {
  await loadCaches();
  const { reporterId } = await chrome.storage.local.get("reporterId");
  if (!reporterId) {
    await chrome.storage.local.set({ reporterId: crypto.randomUUID() });
  }
  drawIcon();
}

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

// Returns { nickname: { data: flagObj|null, steamId: string|null } }
async function lookupNames(nicknames) {
  const now = Date.now();
  const resolved = {}; // nickname → steamId
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
        await saveNameCache();
      }
    } catch { /* network error */ }
  }

  const steamIds = [...new Set(Object.values(resolved).filter(Boolean))];
  const flagData = await lookupSteamIds(steamIds);

  const result = {};
  for (const name of nicknames) {
    const steamId = resolved[name] ?? null;
    result[name] = { data: steamId ? (flagData[steamId] ?? null) : null, steamId };
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
        await saveNameCache();
        return { steamId, displayName: nickname };
      }
    }
  } catch { /* fall through */ }
  return null;
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
      await saveFlagCache();
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

// communitySearch returns just the flag data object (or null), not the wrapped form.
async function communitySearch(nickname) {
  const name = nickname.trim().toLowerCase();
  const result = await lookupNames([name]);
  return result[name]?.data ?? null;
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
