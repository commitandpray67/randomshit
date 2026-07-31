// Injected into every faceit.com page.
// Sends FACEIT nicknames to background SW → resolves to Steam IDs →
// checks community database → highlights flagged players by rank.
// Also injects a per-player flag button that opens an inline panel.

const RANK = {
  S: { color: "#cc0000", glow: "rgba(204,0,0,.95), 0 0 22px rgba(204,0,0,.6)" },
  A: { color: "#ff3333", glow: "rgba(255,51,51,.9),  0 0 16px rgba(255,51,51,.5)" },
  B: { color: "#ff6600", glow: "rgba(255,102,0,.9),  0 0 14px rgba(255,102,0,.4)" },
  C: { color: "#ffaa00", glow: "rgba(255,170,0,.8),  0 0 12px rgba(255,170,0,.3)" },
  D: { color: "#ddcc00", glow: "rgba(221,204,0,.7),  0 0 10px rgba(221,204,0,.3)" },
  F: { color: "#888888", glow: "rgba(136,136,136,.6)" },
};

// nickname (lowercase) → { data: flagObj|null, steamId: string|null } | undefined
// undefined = not yet looked up
const known = {};
let timer = null;

function norm(s) { return s.trim().toLowerCase(); }

function send(msg) {
  return new Promise((r) => chrome.runtime.sendMessage(msg, r));
}

function pageNicknames() {
  const set = new Set();
  document.querySelectorAll("a[href*='/players/']").forEach((a) => {
    const m = (a.getAttribute("href") || "").match(/\/players\/([^/?#\s]+)/i);
    if (m) set.add(norm(decodeURIComponent(m[1])));
  });
  return [...set];
}

// ── Highlights ───────────────────────────────────────────────────────────────

function applyHighlights() {
  document.querySelectorAll("a[href*='/players/']").forEach((link) => {
    const m = (link.getAttribute("href") || "").match(/\/players\/([^/?#\s]+)/i);
    if (!m) return;

    const name  = norm(decodeURIComponent(m[1]));
    const entry = known[name];
    if (entry === undefined) return; // not yet looked up

    const { data, steamId } = entry;

    // Inject flag button once per resolved link.
    if (steamId && !link.dataset.etFlagBtn) {
      injectFlagButton(link, name, steamId);
      link.dataset.etFlagBtn = "1";
    }

    if (!data) return; // null = clean player

    const rank = data.worst_rank;

    // Already tagged at this rank — just refresh tooltip.
    if (link.dataset.etRank === rank) {
      const badge = link.querySelector(".et-badge");
      if (badge) badge.title = makeTooltip(data);
      return;
    }

    link.querySelector(".et-badge")?.remove();

    const { color, glow } = RANK[rank] || RANK.F;
    link.dataset.etRank = rank;

    // setProperty("...", "important") avoids the cssText += accumulation bug.
    link.style.setProperty("color",       color,              "important");
    link.style.setProperty("text-shadow", `0 0 6px ${glow}`, "important");
    link.style.setProperty("font-weight", "700",              "important");

    const badge = document.createElement("span");
    badge.className   = "et-badge";
    badge.textContent = ` [${rank}]`;
    badge.title       = makeTooltip(data);
    badge.style.cssText =
      `cursor:help;font-style:normal;font-size:.82em;font-weight:900;` +
      `color:${color};text-shadow:none;letter-spacing:.04em`;
    link.appendChild(badge);
  });

  updateBadge();
}

function makeTooltip(entry) {
  const who = entry.display_name ? `${entry.display_name}  ·  ` : "";
  const n   = entry.flag_count;
  return `${who}Rank ${entry.worst_rank}  ·  ${n} community report${n !== 1 ? "s" : ""}\n${entry.top_comment}`;
}

function updateBadge() {
  let count = 0;
  document.querySelectorAll("a[href*='/players/']").forEach((link) => {
    const m = (link.getAttribute("href") || "").match(/\/players\/([^/?#\s]+)/i);
    if (!m) return;
    if (known[norm(decodeURIComponent(m[1]))]?.data) count++;
  });
  chrome.runtime.sendMessage({ type: "SET_BADGE", count });
}

// ── Refresh pipeline ─────────────────────────────────────────────────────────

function refresh() {
  const all     = pageNicknames();
  const unknown = all.filter((n) => !(n in known));

  if (unknown.length === 0) {
    applyHighlights();
    return;
  }

  chrome.runtime.sendMessage({ type: "LOOKUP_NAMES", names: unknown }, (result) => {
    if (!result) return;
    for (const [name, entry] of Object.entries(result)) {
      known[name] = entry; // { data, steamId }
    }
    applyHighlights();
  });
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(refresh, 150);
}

// ── Inline flag panel ────────────────────────────────────────────────────────

let panel         = null;
let panelSteamId  = null;
let panelNickname = null;
let panelRank     = null;

function ensurePanelStyles() {
  if (document.getElementById("et-styles")) return;
  const s = document.createElement("style");
  s.id = "et-styles";
  s.textContent = `
    .et-flag-btn {
      display: inline-block; margin-left: 5px;
      font-size: .78em; color: #3a3a3a; cursor: pointer;
      transition: color .12s; user-select: none;
      vertical-align: middle; line-height: 1; font-weight: 900;
    }
    .et-flag-btn:hover { color: #ff3333; }
    #et-panel {
      position: fixed; z-index: 2147483647;
      background: #0d0d0d; border: 1px solid #440000;
      border-radius: 8px; padding: 12px 14px; width: 300px;
      box-shadow: 0 12px 40px rgba(0,0,0,.85);
      font-family: "Segoe UI", system-ui, sans-serif;
      font-size: 13px; color: #e0e0e0;
    }
    #et-panel-head {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 10px; padding-bottom: 8px;
      border-bottom: 1px solid #1e0000;
    }
    #et-panel-title {
      font-weight: 800; letter-spacing: .1em; color: #ff4444;
      text-transform: uppercase; font-size: 10px; flex: 1;
    }
    #et-panel-pname { color: #ddd; font-size: 12px; font-weight: 600; }
    #et-panel-close {
      background: none; border: none; color: #444;
      cursor: pointer; font-size: 15px; line-height: 1; padding: 0 2px;
    }
    #et-panel-close:hover { color: #ff3333; }
    .et-pr-row { display: flex; gap: 4px; margin-bottom: 8px; }
    .et-pr {
      flex: 1; padding: 6px 0; font-size: 12px; font-weight: 900;
      border-radius: 4px; cursor: pointer; border: 2px solid transparent; text-align: center;
    }
    .et-pr[data-r="S"] { background:#1a0000;color:#cc0000;border-color:#440000; }
    .et-pr[data-r="A"] { background:#1a0000;color:#ff3333;border-color:#3a0000; }
    .et-pr[data-r="B"] { background:#1a0800;color:#ff6600;border-color:#3a1500; }
    .et-pr[data-r="C"] { background:#1a1000;color:#ffaa00;border-color:#3a2000; }
    .et-pr[data-r="D"] { background:#161600;color:#cccc00;border-color:#2e2e00; }
    .et-pr[data-r="F"] { background:#181818;color:#888;   border-color:#2a2a2a; }
    .et-pr.et-sel[data-r="S"] { background:#3a0000;border-color:#cc0000;box-shadow:0 0 8px rgba(204,0,0,.5); }
    .et-pr.et-sel[data-r="A"] { background:#3a0000;border-color:#ff3333;box-shadow:0 0 8px rgba(255,51,51,.5); }
    .et-pr.et-sel[data-r="B"] { background:#3a1500;border-color:#ff6600;box-shadow:0 0 8px rgba(255,102,0,.4); }
    .et-pr.et-sel[data-r="C"] { background:#3a2000;border-color:#ffaa00;box-shadow:0 0 8px rgba(255,170,0,.4); }
    .et-pr.et-sel[data-r="D"] { background:#2e2e00;border-color:#cccc00;box-shadow:0 0 8px rgba(204,204,0,.3); }
    .et-pr.et-sel[data-r="F"] { background:#2a2a2a;border-color:#888;   box-shadow:0 0 6px rgba(136,136,136,.3); }
    #et-panel-comment {
      width: 100%; background: #181818; border: 1px solid #2a2a2a;
      border-radius: 4px; color: #e0e0e0; padding: 7px 10px;
      font-size: 12px; outline: none; resize: vertical; min-height: 52px;
      font-family: inherit; margin-bottom: 8px; box-sizing: border-box;
    }
    #et-panel-comment:focus  { border-color: #ff3333; }
    #et-panel-comment::placeholder { color: #444; }
    #et-panel-submit {
      width: 100%; background: #cc0000; color: #fff; border: none;
      border-radius: 4px; padding: 7px; font-size: 11px; font-weight: 800;
      letter-spacing: .09em; text-transform: uppercase; cursor: pointer;
    }
    #et-panel-submit:disabled            { background: #2a2a2a; color: #555; cursor: not-allowed; }
    #et-panel-submit:hover:not(:disabled){ background: #ff1a1a; }
    #et-panel-status { font-size: 11px; margin-top: 6px; min-height: 14px; }
  `;
  document.head.appendChild(s);
}

function buildPanel() {
  const div = document.createElement("div");
  div.id = "et-panel";
  div.style.display = "none";
  div.innerHTML = `
    <div id="et-panel-head">
      <span id="et-panel-title">ELO TERRORISTS</span>
      <span id="et-panel-pname"></span>
      <button id="et-panel-close">✕</button>
    </div>
    <div class="et-pr-row">
      ${["S","A","B","C","D","F"].map((r) => `<button class="et-pr" data-r="${r}">${r}</button>`).join("")}
    </div>
    <textarea id="et-panel-comment"
      placeholder="Reason — required (e.g. sold 3 games in a row)"
      maxlength="500"></textarea>
    <button id="et-panel-submit" disabled>FLAG TERRORIST</button>
    <div id="et-panel-status"></div>
  `;
  document.body.appendChild(div);

  div.querySelector("#et-panel-close").addEventListener("click", hidePanel);

  div.querySelectorAll(".et-pr").forEach((btn) => {
    btn.addEventListener("click", () => {
      div.querySelectorAll(".et-pr").forEach((b) => b.classList.remove("et-sel"));
      btn.classList.add("et-sel");
      panelRank = btn.dataset.r;
      checkPanelReady();
    });
  });

  div.querySelector("#et-panel-comment").addEventListener("input", checkPanelReady);

  div.querySelector("#et-panel-submit").addEventListener("click", async () => {
    if (!panelSteamId || !panelRank) return;
    const comment = div.querySelector("#et-panel-comment").value.trim();
    if (!comment) return;

    const submitBtn = div.querySelector("#et-panel-submit");
    const statusEl  = div.querySelector("#et-panel-status");
    submitBtn.disabled    = true;
    submitBtn.textContent = "FLAGGING…";
    statusEl.textContent  = "";

    const result = await send({
      type:        "FLAG",
      steamId:     panelSteamId,
      displayName: panelNickname,
      rank:        panelRank,
      comment,
    });

    if (result?.ok) {
      statusEl.style.color  = "#66cc66";
      statusEl.textContent  = "✓ Flagged";
      delete known[norm(panelNickname)]; // bust cache → re-lookup on next refresh
      setTimeout(() => { hidePanel(); schedule(); }, 700);
    } else {
      submitBtn.disabled    = false;
      submitBtn.textContent = "RETRY";
      statusEl.style.color  = "#ff6666";
      statusEl.textContent  = "Failed — try again";
    }
  });

  document.addEventListener("click", (e) => {
    if (!panel || panel.style.display === "none") return;
    if (panel.contains(e.target)) return;
    if (e.target.classList.contains("et-flag-btn")) return;
    hidePanel();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hidePanel();
  });

  return div;
}

function getPanel() {
  if (!panel) panel = buildPanel();
  return panel;
}

function showPanel(anchor, nickname, steamId) {
  ensurePanelStyles();
  const p = getPanel();

  panelSteamId  = steamId;
  panelNickname = nickname;
  panelRank     = null;

  p.querySelector("#et-panel-pname").textContent  = nickname;
  p.querySelectorAll(".et-pr").forEach((b) => b.classList.remove("et-sel"));
  p.querySelector("#et-panel-comment").value      = "";
  p.querySelector("#et-panel-submit").disabled    = true;
  p.querySelector("#et-panel-submit").textContent = "FLAG TERRORIST";
  p.querySelector("#et-panel-status").textContent = "";

  p.style.display = "block";

  // Position near anchor (fixed = viewport coords, no scroll offset).
  const rect   = anchor.getBoundingClientRect();
  const panelW = 300;
  const panelH = 240;
  let left = rect.left;
  let top  = rect.bottom + 4;

  if (left + panelW > window.innerWidth  - 8) left = window.innerWidth  - panelW - 8;
  if (top  + panelH > window.innerHeight - 8) top  = Math.max(8, rect.top - panelH - 4);
  left = Math.max(8, left);

  p.style.left = `${left}px`;
  p.style.top  = `${top}px`;

  requestAnimationFrame(() => p.querySelector("#et-panel-comment").focus());
}

function hidePanel() {
  if (panel) panel.style.display = "none";
  panelSteamId  = null;
  panelNickname = null;
  panelRank     = null;
}

function checkPanelReady() {
  if (!panel) return;
  const comment = panel.querySelector("#et-panel-comment").value.trim();
  panel.querySelector("#et-panel-submit").disabled = !(panelRank && comment);
}

function injectFlagButton(link, nickname, steamId) {
  ensurePanelStyles();
  const btn = document.createElement("span");
  btn.className   = "et-flag-btn";
  btn.textContent = "⚑";
  btn.title       = `Flag ${nickname} as ELO terrorist`;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showPanel(btn, nickname, steamId);
  });
  link.parentNode?.insertBefore(btn, link.nextSibling);
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init() {
  refresh();
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree:   true,
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
