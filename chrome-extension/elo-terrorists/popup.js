const STORAGE_KEY = "eloTerrorists";

function norm(name) {
  return name.trim().toLowerCase();
}

function load() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEY, (data) => {
      resolve(data[STORAGE_KEY] || {});
    });
  });
}

function save(data) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: data }, resolve);
  });
}

function timeAgo(iso) {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 30) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function render(terrorists, filter, flashName) {
  const list = document.getElementById("terrorist-list");
  const countEl = document.getElementById("count");

  const entries = Object.entries(terrorists);
  countEl.textContent = `${entries.length} flagged`;

  const q = (filter || "").toLowerCase().trim();
  const visible = q
    ? entries.filter(([name, info]) =>
        name.includes(q) || info.comment.toLowerCase().includes(q)
      )
    : entries;

  if (visible.length === 0) {
    list.innerHTML = `<li class="empty">${
      q ? `No results for "${filter}".` : "No one flagged yet."
    }</li>`;
    return;
  }

  // Most recently added first
  visible.sort(([, a], [, b]) => new Date(b.addedAt) - new Date(a.addedAt));

  list.innerHTML = visible
    .map(
      ([name, info]) => `
    <li class="terrorist-item${name === flashName ? " just-added" : ""}" data-name="${name}">
      <div class="item-top">
        <a class="player-name" href="https://www.faceit.com/en/players/${encodeURIComponent(name)}" target="_blank" rel="noopener">${name}</a>
        <button class="delete-btn" data-name="${name}" title="Remove">✕</button>
      </div>
      <div class="item-comment">${escHtml(info.comment)}</div>
      <div class="item-meta">Added ${timeAgo(info.addedAt)}</div>
    </li>
  `
    )
    .join("");

  list.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = btn.dataset.name;
      const data = await load();
      delete data[name];
      await save(data);
      render(data, searchInput.value);
    });
  });
}

function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const nameInput = document.getElementById("player-name");
const commentInput = document.getElementById("comment");
const searchInput = document.getElementById("search");
const form = document.getElementById("add-form");

let state = {};

document.addEventListener("DOMContentLoaded", async () => {
  state = await load();
  render(state, "");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = norm(nameInput.value);
    const comment = commentInput.value.trim();
    if (!name || !comment) return;

    state = await load();
    state[name] = { comment, addedAt: new Date().toISOString() };
    await save(state);

    nameInput.value = "";
    commentInput.value = "";
    nameInput.focus();

    render(state, searchInput.value, name);
  });

  searchInput.addEventListener("input", () => {
    render(state, searchInput.value);
  });
});
