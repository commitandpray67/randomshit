"use client";

import { useMemo, useState } from "react";

export type FriendRow = {
  id: string;
  name: string;
  url: string;
  avatar: string;
  friendSince: string; // display, e.g. "2022-02-12" or "unknown"
  friendSinceTs: number; // sort key
  removedAt?: string;
  status: "active" | "removed";
};

type Filter = "current" | "removed" | "all";

export default function FriendsView({
  active,
  removed,
}: {
  active: FriendRow[];
  removed: FriendRow[];
}) {
  const [filter, setFilter] = useState<Filter>("current");
  const [q, setQ] = useState("");

  // "Ever tracked": everyone, oldest friendship first.
  const all = useMemo(
    () => [...active, ...removed].sort((a, b) => a.friendSinceTs - b.friendSinceTs),
    [active, removed],
  );

  const base = filter === "current" ? active : filter === "removed" ? removed : all;
  const needle = q.trim().toLowerCase();
  const list = needle ? base.filter((r) => r.name.toLowerCase().includes(needle)) : base;

  return (
    <>
      <div className="stats">
        <button
          type="button"
          className={`stat ok ${filter === "current" ? "active" : ""}`}
          aria-pressed={filter === "current"}
          onClick={() => setFilter("current")}
        >
          <div className="num">{active.length}</div>
          <div className="lbl">Current friends</div>
        </button>
        <button
          type="button"
          className={`stat danger ${filter === "removed" ? "active" : ""}`}
          aria-pressed={filter === "removed"}
          onClick={() => setFilter("removed")}
        >
          <div className="num">{removed.length}</div>
          <div className="lbl">Unfriended you</div>
        </button>
        <button
          type="button"
          className={`stat ${filter === "all" ? "active" : ""}`}
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          <div className="num">{all.length}</div>
          <div className="lbl">Ever tracked</div>
        </button>
      </div>

      <div className="list-controls">
        <input
          className="search"
          type="search"
          placeholder="Search by name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="muted">{list.length} shown</span>
      </div>

      <div className="card list">
        {list.length === 0 ? (
          <div className="empty">
            <div className="empty-icon" aria-hidden="true">
              {emptyIcon(filter, needle)}
            </div>
            {emptyMessage(filter, needle)}
          </div>
        ) : (
          list.map((r) => (
            <div className="row" key={`${r.status}:${r.id}`}>
              {r.avatar ? (
                <img src={r.avatar} alt="" loading="lazy" />
              ) : (
                <div className="avatar-fallback">{r.name.slice(0, 1)}</div>
              )}
              <div className="info">
                <div className="n">
                  <a href={r.url || "#"} target="_blank" rel="noreferrer">
                    {r.name}
                  </a>
                </div>
                <div className="s">
                  {r.status === "removed" ? (
                    <>
                      friends {r.friendSince} →{" "}
                      <span className="gone">gone {r.removedAt}</span>
                    </>
                  ) : (
                    `friends since ${r.friendSince}`
                  )}
                </div>
              </div>
              {r.status === "removed" && (
                <span className="badge badge-removed">removed</span>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}

function emptyIcon(filter: Filter, needle: string): string {
  if (needle) return "🔍";
  if (filter === "removed") return "🎉";
  return "👥";
}

function emptyMessage(filter: Filter, needle: string): string {
  if (needle) return `No matches for “${needle}”.`;
  if (filter === "removed") return "Nobody has unfriended you yet.";
  if (filter === "current") return "No friends found yet.";
  return "No friends tracked yet.";
}
