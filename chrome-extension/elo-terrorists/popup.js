function norm(name) {
  return name.trim().toLowerCase();
}

function escHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function timeAgo(iso) {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 30) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

// ── My flags list ────────────────────────────────────────────────────────────

async function loadMyFlags() {
  return (await send({ type: "MY_FLAGS" })) ?? {};
}

function renderMyFlags(myFlags) {
  const list = document.getElementById("my-list");
  const count = document.getElementById("my-count");
  const entries = Object.entries(myFlags).sort(
    ([, a], [, b]) => new Date(b.addedAt) - new Date(a.addedAt)
  );

  count.textContent = entries.length;

  if (entries.length === 0) {
    list.innerHTML = `<li class="empty-my">No players flagged yet.</li>`;
    return;
  }

  list.innerHTML = entries
    .map(
      ([name, info]) => `
    <li class="my-item">
      <div class="my-item-top">
        <a class="my-item-name"
           href="https://www.faceit.com/en/players/${encodeURIComponent(name)}"
           target="_blank" rel="noopener">${escHtml(name)}</a>
        <button class="remove-btn" data-name="${escHtml(name)}" title="Remove my flag">✕</button>
      </div>
      <div class="my-item-comment">${escHtml(info.comment)}</div>
      <div class="my-item-meta">Flagged ${timeAgo(info.addedAt)}</div>
    </li>`
    )
    .join("");

  list.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const name = btn.dataset.name;
      await send({ type: "UNFLAG", nickname: name });
      renderMyFlags(await loadMyFlags());
    });
  });
}

// ── Search ───────────────────────────────────────────────────────────────────

async function doSearch(nickname) {
  const box = document.getElementById("search-result");
  const name = norm(nickname);
  if (!name) { box.className = "search-result hidden"; return; }

  box.className = "search-result";
  box.innerHTML = `<span class="result-loading">Looking up ${escHtml(name)}…</span>`;

  const data = await send({ type: "COMMUNITY_SEARCH", nickname: name });

  if (!data) {
    box.className = "search-result clean";
    box.innerHTML = `<strong>${escHtml(name)}</strong> — no community reports. They're clean (so far).`;
  } else {
    const plural = data.flag_count !== 1 ? "s" : "";
    box.className = "search-result flagged";
    box.innerHTML = `
      <div><span class="result-name">☠ ${escHtml(data.nickname)}</span>
           &nbsp;<span class="result-count">${data.flag_count} report${plural}</span></div>
      <div class="result-comment">${escHtml(data.latest_comment)}</div>`;
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  // Render my flags
  renderMyFlags(await loadMyFlags());

  // Search
  const searchInput = document.getElementById("search-input");
  document.getElementById("search-btn").addEventListener("click", () => {
    doSearch(searchInput.value);
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch(searchInput.value);
  });

  // Add flag form
  const form = document.getElementById("add-form");
  const nameInput = document.getElementById("player-name");
  const commentInput = document.getElementById("comment");
  const submitBtn = form.querySelector("button[type=submit]");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nickname = norm(nameInput.value);
    const comment = commentInput.value.trim();
    if (!nickname || !comment) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "FLAGGING…";

    const result = await send({ type: "FLAG", nickname, comment });

    submitBtn.disabled = false;
    submitBtn.textContent = "FLAG TERRORIST";

    if (result?.ok) {
      nameInput.value = "";
      commentInput.value = "";
      nameInput.focus();
      renderMyFlags(await loadMyFlags());
    } else {
      submitBtn.textContent = "FAILED — RETRY";
      setTimeout(() => { submitBtn.textContent = "FLAG TERRORIST"; }, 2000);
    }
  });
});
