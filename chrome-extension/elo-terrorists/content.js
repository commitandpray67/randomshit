// Injected into every faceit.com page.
// Sends FACEIT nicknames to the background SW → resolves to Steam IDs →
// checks the community database → highlights flagged players by rank.

const RANK = {
  S: { color: "#cc0000", glow: "rgba(204,0,0,.95), 0 0 22px rgba(204,0,0,.6)" },
  A: { color: "#ff3333", glow: "rgba(255,51,51,.9),  0 0 16px rgba(255,51,51,.5)" },
  B: { color: "#ff6600", glow: "rgba(255,102,0,.9),  0 0 14px rgba(255,102,0,.4)" },
  C: { color: "#ffaa00", glow: "rgba(255,170,0,.8),  0 0 12px rgba(255,170,0,.3)" },
  D: { color: "#ddcc00", glow: "rgba(221,204,0,.7),  0 0 10px rgba(221,204,0,.3)" },
  F: { color: "#888888", glow: "rgba(136,136,136,.6)" },
};

// nickname (lowercase) → API result object | null ("confirmed clean")
// key absent = not yet looked up
const known = {};
let timer = null;

function norm(s) { return s.trim().toLowerCase(); }

function pageNicknames() {
  const set = new Set();
  document.querySelectorAll("a[href*='/players/']").forEach((a) => {
    const m = (a.getAttribute("href") || "").match(/\/players\/([^/?#\s]+)/i);
    if (m) set.add(norm(decodeURIComponent(m[1])));
  });
  return [...set];
}

function applyHighlights() {
  document.querySelectorAll("a[href*='/players/']").forEach((link) => {
    const m = (link.getAttribute("href") || "").match(/\/players\/([^/?#\s]+)/i);
    if (!m) return;

    const name = norm(decodeURIComponent(m[1]));
    const entry = known[name];
    if (!entry) return; // null = clean, undefined = still pending

    const rank = entry.worst_rank;

    // Already tagged with the same rank — just refresh the tooltip.
    if (link.dataset.etRank === rank) {
      const badge = link.querySelector(".et-badge");
      if (badge) badge.title = makeTooltip(entry);
      return;
    }

    // Remove any previous badge (rank may have changed after a cache refresh).
    link.querySelector(".et-badge")?.remove();

    const { color, glow } = RANK[rank] || RANK.F;
    link.dataset.etRank = rank;
    link.style.cssText +=
      `;color:${color}!important` +
      `;text-shadow:0 0 6px ${glow}!important` +
      `;font-weight:700!important`;

    const badge = document.createElement("span");
    badge.className = "et-badge";
    badge.textContent = ` [${rank}]`;
    badge.title = makeTooltip(entry);
    badge.style.cssText =
      `cursor:help;font-style:normal;font-size:.82em;font-weight:900;` +
      `color:${color};text-shadow:none;letter-spacing:.04em`;
    link.appendChild(badge);
  });
}

function makeTooltip(entry) {
  const who = entry.display_name ? `${entry.display_name}  ·  ` : "";
  const n = entry.flag_count;
  return `${who}Rank ${entry.worst_rank}  ·  ${n} community report${n !== 1 ? "s" : ""}\n${entry.top_comment}`;
}

function refresh() {
  const all = pageNicknames();
  const unknown = all.filter((n) => !(n in known));

  if (unknown.length === 0) {
    applyHighlights();
    return;
  }

  chrome.runtime.sendMessage({ type: "LOOKUP_NAMES", names: unknown }, (result) => {
    if (!result) return;
    for (const [name, data] of Object.entries(result)) {
      known[name] = data; // null = clean, object = flagged
    }
    applyHighlights();
  });
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(refresh, 150);
}

function init() {
  refresh();
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
