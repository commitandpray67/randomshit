// Injected into every faceit.com page.
// Asks the background service worker to look up player names, then highlights
// flagged ones red. Never calls the API directly.

// nickname (lowercase) → API result object | null ("confirmed clean")
// undefined = not yet looked up
const lookup = {};
let debounceTimer = null;

function norm(name) {
  return name.trim().toLowerCase();
}

function playerLinksOnPage() {
  const names = new Set();
  document.querySelectorAll("a[href*='/players/']").forEach((a) => {
    const m = (a.getAttribute("href") || "").match(/\/players\/([^/?#\s]+)/i);
    if (m) names.add(norm(decodeURIComponent(m[1])));
  });
  return [...names];
}

function applyHighlights() {
  document.querySelectorAll("a[href*='/players/']").forEach((link) => {
    const m = (link.getAttribute("href") || "").match(/\/players\/([^/?#\s]+)/i);
    if (!m) return;

    const name = norm(decodeURIComponent(m[1]));
    const entry = lookup[name];
    if (!entry) return; // null = clean; undefined = pending

    if (link.dataset.etTagged) {
      // Refresh tooltip in case flag count changed
      const badge = link.querySelector(".et-badge");
      if (badge) badge.title = tooltip(entry);
      return;
    }

    link.dataset.etTagged = "1";
    link.style.cssText +=
      ";color:#ff3333!important" +
      ";text-shadow:0 0 6px rgba(255,51,51,.9),0 0 14px rgba(255,51,51,.5)!important" +
      ";font-weight:700!important";

    const badge = document.createElement("span");
    badge.className = "et-badge";
    badge.textContent = " ☠";
    badge.title = tooltip(entry);
    badge.style.cssText = "cursor:help;font-style:normal;text-shadow:0 0 4px #ff3333";
    link.appendChild(badge);
  });
}

function tooltip(entry) {
  const plural = entry.flag_count !== 1 ? "s" : "";
  return `☠ ELO TERRORIST — ${entry.flag_count} report${plural}\n${entry.latest_comment}`;
}

function refresh() {
  const allNames = playerLinksOnPage();
  const unknown = allNames.filter((n) => !(n in lookup));

  if (unknown.length === 0) {
    applyHighlights();
    return;
  }

  chrome.runtime.sendMessage({ type: "LOOKUP", names: unknown }, (result) => {
    if (!result) return;
    for (const [name, data] of Object.entries(result)) {
      lookup[name] = data; // data is the API object or null
    }
    applyHighlights();
  });
}

function scheduleRefresh() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(refresh, 150);
}

function init() {
  refresh();
  new MutationObserver(scheduleRefresh).observe(document.body, {
    childList: true,
    subtree: true,
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
