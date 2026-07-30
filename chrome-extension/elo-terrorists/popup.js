const RANK_COLOR = {
  S: "#cc0000", A: "#ff3333", B: "#ff6600",
  C: "#ffaa00", D: "#cccc00", F: "#888888",
};

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60)          return "just now";
  if (s < 3600)        return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)       return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30)  return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function send(msg) {
  return new Promise((r) => chrome.runtime.sendMessage(msg, r));
}

// ── My flags ─────────────────────────────────────────────────────────────────

async function refreshMyFlags() {
  const myFlags = (await send({ type: "MY_FLAGS" })) ?? {};
  const list    = document.getElementById("my-list");
  const counter = document.getElementById("my-count");
  const entries = Object.entries(myFlags).sort(
    ([, a], [, b]) => new Date(b.addedAt) - new Date(a.addedAt)
  );

  counter.textContent = entries.length;

  if (entries.length === 0) {
    list.innerHTML = `<li class="empty-my">No players flagged yet.</li>`;
    return;
  }

  list.innerHTML = entries.map(([steamId, info]) => {
    const color = RANK_COLOR[info.rank] || RANK_COLOR.F;
    const name  = info.displayName || steamId;
    const href  = `https://www.faceit.com/en/players/${encodeURIComponent(info.displayName || "")}`;
    return `
    <li class="my-item" style="--rank-color:${color}">
      <div class="my-item-top">
        <span class="my-rank-badge" style="color:${color};border:1px solid ${color}33">${escHtml(info.rank)}</span>
        <a class="my-item-name" href="${escHtml(href)}" target="_blank" rel="noopener"
           title="Steam ID: ${escHtml(steamId)}">${escHtml(name)}</a>
        <button class="remove-btn" data-steamid="${escHtml(steamId)}" title="Remove my flag">✕</button>
      </div>
      <div class="my-item-comment">${escHtml(info.comment)}</div>
      <div class="my-item-meta">Flagged ${timeAgo(info.addedAt)}</div>
    </li>`;
  }).join("");

  list.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await send({ type: "UNFLAG", steamId: btn.dataset.steamid });
      refreshMyFlags();
    });
  });
}

// ── Community search ──────────────────────────────────────────────────────────

async function doSearch(nickname) {
  const box = document.getElementById("search-result");
  const name = nickname.trim();
  if (!name) { box.className = "search-result hidden"; return; }

  box.className = "search-result";
  box.innerHTML = `<span class="result-loading">Looking up ${escHtml(name)}…</span>`;

  const data = await send({ type: "COMMUNITY_SEARCH", nickname: name });

  if (!data) {
    box.className = "search-result clean";
    box.innerHTML = `<strong>${escHtml(name)}</strong> — no community reports.`;
  } else {
    const color  = RANK_COLOR[data.worst_rank] || RANK_COLOR.F;
    const plural = data.flag_count !== 1 ? "s" : "";
    box.className = "search-result flagged";
    box.innerHTML = `
      <div>
        <span class="result-name" style="color:${color}">${escHtml(data.display_name || name)}</span>
        <span class="result-count" style="color:${color}">Rank ${escHtml(data.worst_rank)} · ${data.flag_count} report${plural}</span>
      </div>
      <div class="result-comment">${escHtml(data.top_comment)}</div>`;
  }
}

// ── Flag form ─────────────────────────────────────────────────────────────────

let resolvedSteamId   = null;
let resolvedNickname  = null;
let selectedRank      = null;

function setRankSection(visible) {
  document.getElementById("rank-section").classList.toggle("hidden", !visible);
}

function resetForm() {
  resolvedSteamId  = null;
  resolvedNickname = null;
  selectedRank     = null;
  document.getElementById("player-name").value = "";
  document.getElementById("comment").value     = "";
  document.getElementById("resolve-status").className = "resolve-status hidden";
  document.querySelectorAll(".rank-btn").forEach((b) => b.classList.remove("selected"));
  document.getElementById("rank-desc").textContent = "";
  document.getElementById("submit-btn").disabled   = true;
  setRankSection(false);
}

function checkSubmitReady() {
  document.getElementById("submit-btn").disabled =
    !(resolvedSteamId && selectedRank && document.getElementById("comment").value.trim());
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  refreshMyFlags();

  // Search
  const searchInput = document.getElementById("search-input");
  document.getElementById("search-btn").addEventListener("click", () => doSearch(searchInput.value));
  searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(searchInput.value); });

  // Resolve button
  document.getElementById("resolve-btn").addEventListener("click", async () => {
    const nickname = document.getElementById("player-name").value.trim();
    if (!nickname) return;

    const statusEl = document.getElementById("resolve-status");
    statusEl.className = "resolve-status spin";
    statusEl.textContent = `Looking up "${nickname}"…`;
    statusEl.classList.remove("hidden");
    setRankSection(false);
    resolvedSteamId = null;

    const result = await send({ type: "RESOLVE_ONE", nickname });

    if (!result) {
      statusEl.className = "resolve-status err";
      statusEl.textContent = `"${nickname}" not found on FACEIT, or account not linked to Steam.`;
    } else {
      resolvedSteamId  = result.steamId;
      resolvedNickname = nickname;
      statusEl.className = "resolve-status ok";
      statusEl.textContent = `✓ Found — Steam ID ${result.steamId}`;
      setRankSection(true);
    }
    checkSubmitReady();
  });

  // Rank buttons
  document.querySelectorAll(".rank-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".rank-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedRank = btn.dataset.rank;
      document.getElementById("rank-desc").textContent = btn.dataset.desc;
      checkSubmitReady();
    });
  });

  document.getElementById("comment").addEventListener("input", checkSubmitReady);

  // Submit
  document.getElementById("add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!resolvedSteamId || !selectedRank) return;

    const comment   = document.getElementById("comment").value.trim();
    const submitBtn = document.getElementById("submit-btn");
    if (!comment) return;

    submitBtn.disabled     = true;
    submitBtn.textContent  = "FLAGGING…";

    const result = await send({
      type: "FLAG",
      steamId:     resolvedSteamId,
      displayName: resolvedNickname,
      rank:        selectedRank,
      comment,
    });

    if (result?.ok) {
      resetForm();
      refreshMyFlags();
    } else {
      submitBtn.disabled    = false;
      submitBtn.textContent = "FAILED — RETRY";
      setTimeout(() => { submitBtn.textContent = "FLAG TERRORIST"; checkSubmitReady(); }, 2000);
    }
  });
});
