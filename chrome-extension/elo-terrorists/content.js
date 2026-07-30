const STORAGE_KEY = "eloTerrorists";

let terrorists = {};
let debounceTimer = null;

function norm(name) {
  return name.trim().toLowerCase();
}

function highlight() {
  // FACEIT renders player names as links to /players/{nickname}
  const links = document.querySelectorAll("a[href*='/players/']");

  for (const link of links) {
    const href = link.getAttribute("href") || "";
    const match = href.match(/\/players\/([^/?#\s]+)/i);
    if (!match) continue;

    const playerName = norm(decodeURIComponent(match[1]));
    const entry = terrorists[playerName];

    if (!entry) continue;

    // Already tagged — update tooltip in case comment changed but skip restyle
    if (link.dataset.etTagged) {
      const badge = link.querySelector(".et-badge");
      if (badge) badge.title = `ELO TERRORIST: ${entry.comment}`;
      continue;
    }

    link.dataset.etTagged = "1";
    link.style.cssText +=
      ";color:#ff3333!important;text-shadow:0 0 6px rgba(255,51,51,.9),0 0 14px rgba(255,51,51,.5)!important;font-weight:700!important";

    const badge = document.createElement("span");
    badge.className = "et-badge";
    badge.textContent = " ☠";
    badge.title = `ELO TERRORIST: ${entry.comment}`;
    badge.style.cssText =
      "cursor:help;font-style:normal;text-shadow:0 0 4px #ff3333";
    link.appendChild(badge);
  }
}

function scheduleHighlight() {
  clearTimeout(debounceTimer);
  // Debounce so rapid DOM mutations don't hammer the loop
  debounceTimer = setTimeout(highlight, 120);
}

function clearTags() {
  document.querySelectorAll("[data-et-tagged]").forEach((el) => {
    delete el.dataset.etTagged;
    el.querySelector(".et-badge")?.remove();
    el.style.color = "";
    el.style.textShadow = "";
    el.style.fontWeight = "";
  });
}

function init() {
  chrome.storage.sync.get(STORAGE_KEY, (data) => {
    terrorists = data[STORAGE_KEY] || {};
    highlight();

    const observer = new MutationObserver(scheduleHighlight);
    observer.observe(document.body, { childList: true, subtree: true });
  });

  // Live-sync: if user flags someone in the popup while on FACEIT, highlight immediately
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes[STORAGE_KEY]) return;
    terrorists = changes[STORAGE_KEY].newValue || {};
    clearTags();
    highlight();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
