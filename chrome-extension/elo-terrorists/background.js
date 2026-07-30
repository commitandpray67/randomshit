// Service worker — owns all API calls and the local lookup cache.
//
// Content scripts never call the API directly; they send messages here.
// This avoids CORS issues, centralises caching, and lets the popup and
// content script share the same in-flight request for the same nickname.

const API = "https://steamfriends.xyz/api/et";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// In-memory cache: nickname -> { data: {...} | null, cachedAt: timestamp }
// null means "looked up and confirmed clean". Lives until the SW sleeps.
const cache = new Map();

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
    case "LOOKUP":
      lookupNames(msg.names).then(reply);
      return true;
    case "FLAG":
      flagPlayer(msg.nickname, msg.comment).then(reply);
      return true;
    case "UNFLAG":
      unflagPlayer(msg.nickname).then(reply);
      return true;
    case "MY_FLAGS":
      getMyFlags().then(reply);
      return true;
    case "COMMUNITY_SEARCH":
      lookupNames([msg.nickname.toLowerCase()]).then((r) =>
        reply(r[msg.nickname.toLowerCase()] ?? null)
      );
      return true;
  }
});

// ── API helpers ──────────────────────────────────────────────────────────────

async function lookupNames(names) {
  const result = {};
  const toFetch = [];
  const now = Date.now();

  for (const name of names) {
    const hit = cache.get(name);
    if (hit && now - hit.cachedAt < CACHE_TTL_MS) {
      result[name] = hit.data;
    } else {
      toFetch.push(name);
    }
  }

  if (toFetch.length > 0) {
    try {
      const qs = toFetch.map(encodeURIComponent).join(",");
      const res = await fetch(`${API}/lookup?names=${qs}`);
      if (res.ok) {
        const { terrorists } = await res.json();
        // Build index from API response
        const byName = {};
        for (const t of terrorists) byName[t.nickname] = t;

        for (const name of toFetch) {
          const data = byName[name] ?? null;
          cache.set(name, { data, cachedAt: Date.now() });
          result[name] = data;
        }
      }
    } catch {
      // Network error — leave uncached names as undefined so content
      // script can retry on next mutation.
    }
  }

  return result;
}

async function flagPlayer(nickname, comment) {
  const { reporterId } = await chrome.storage.local.get("reporterId");

  try {
    const res = await fetch(`${API}/flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: nickname.toLowerCase(), comment, reporterId }),
    });

    if (res.ok) {
      // Track locally so the popup can list "my flags" even without a login
      const { myFlags = {} } = await chrome.storage.local.get("myFlags");
      myFlags[nickname.toLowerCase()] = { comment, addedAt: new Date().toISOString() };
      await chrome.storage.local.set({ myFlags });

      // Bust cache so the content script sees the new flag immediately
      cache.delete(nickname.toLowerCase());
      return { ok: true };
    }
    return { ok: false };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

async function unflagPlayer(nickname) {
  const { reporterId } = await chrome.storage.local.get("reporterId");

  try {
    const res = await fetch(`${API}/flag`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: nickname.toLowerCase(), reporterId }),
    });

    if (res.ok) {
      const { myFlags = {} } = await chrome.storage.local.get("myFlags");
      delete myFlags[nickname.toLowerCase()];
      await chrome.storage.local.set({ myFlags });

      cache.delete(nickname.toLowerCase());
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

// ── Icon ─────────────────────────────────────────────────────────────────────

function drawIcon() {
  try {
    const size = 128;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, size, size);

    ctx.shadowColor = "#ff3333";
    ctx.shadowBlur = size * 0.2;
    ctx.fillStyle = "#ff3333";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.floor(size * 0.34)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ET", size / 2, size / 2);

    chrome.action.setIcon({ imageData: ctx.getImageData(0, 0, size, size) });
  } catch {
    // OffscreenCanvas unavailable
  }
}
