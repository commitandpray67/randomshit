import type { Metadata } from "next";

const SITE = process.env.APP_URL || "https://steamfriends.xyz";
const CHROME_STORE_URL = "https://chromewebstore.google.com"; // placeholder until published

export const metadata: Metadata = {
  title: "ELO TERRORISTS — FACEIT Anti-Smurf Chrome Extension",
  description:
    "Community-powered Chrome extension that flags and highlights FACEIT match-fixers and game-throwers by their Steam ID. Know who you're playing with before the match starts.",
  alternates: { canonical: `${SITE}/extension` },
  openGraph: {
    type: "website",
    url: `${SITE}/extension`,
    title: "ELO TERRORISTS — FACEIT Anti-Smurf Extension",
    description:
      "Flag match-fixers by Steam ID. Highlights flagged players on any FACEIT page so you can dodge before the match starts.",
  },
};

const RANKS = [
  { rank: "S", color: "#cc0000", border: "#440000", label: "Hardcore", desc: "Confirmed account seller / throwing for money" },
  { rank: "A", color: "#ff3333", border: "#3a0000", label: "Severe",   desc: "Consistent intentional losing, AFK farming" },
  { rank: "B", color: "#ff6600", border: "#3a1500", label: "High",     desc: "Frequent thrower, obvious game-throwing" },
  { rank: "C", color: "#ffaa00", border: "#3a2000", label: "Mid",      desc: "Suspicious, repeated bad games" },
  { rank: "D", color: "#cccc00", border: "#2e2e00", label: "Low",      desc: "Possible troll, minor recurring issues" },
  { rank: "F", color: "#888888", border: "#2a2a2a", label: "Minimal",  desc: "One-time incident or uncertain" },
];

// Mock players for the FACEIT match-room mockup
const TEAM_CT = [
  { name: "yourusername",  elo: 2341, flag: null },
  { name: "silent_ace",    elo: 2180, flag: null },
  { name: "donk666",       elo: 2450, flag: { rank: "S", color: "#cc0000", glow: "0 0 10px rgba(204,0,0,.8)", comment: "Sold 3 games in a row. Account seller confirmed." } },
  { name: "k1nga_cs",      elo: 1990, flag: null },
  { name: "rush_b_babyyy", elo: 2120, flag: { rank: "B", color: "#ff6600", glow: "0 0 8px rgba(255,102,0,.6)", comment: "Frequent deagle headshots on teammates, obvious throw." } },
];

const TEAM_T = [
  { name: "NiKo_fan2003",  elo: 2280, flag: null },
  { name: "xXProSniper420", elo: 2050, flag: { rank: "A", color: "#ff3333", glow: "0 0 10px rgba(255,51,51,.7)", comment: "Consistent AFK farming. 1-19 multiple games." } },
  { name: "flash_king_99",  elo: 2310, flag: null },
  { name: "clutch_master",  elo: 2190, flag: null },
  { name: "eco_frag_lord",  elo: 2400, flag: { rank: "C", color: "#ffaa00", glow: "0 0 7px rgba(255,170,0,.5)", comment: "Suspicious, loses every pistol round intentionally." } },
];

export default function ExtensionPage() {
  return (
    <main>
      {/* Hero */}
      <div style={{ marginBottom: "2.5rem" }}>
        <p className="muted" style={{ marginBottom: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: "0.78rem" }}>
          Chrome Extension · FACEIT CS2
        </p>
        <h1 style={{ fontSize: "2.2rem", letterSpacing: "-0.02em", lineHeight: 1.1, color: "#fff" }}>
          <span style={{ color: "#ff3333" }}>ELO</span> TERRORISTS
        </h1>
        <p style={{ fontSize: "1.05rem", maxWidth: "36rem", marginTop: "0.75rem", color: "var(--text)" }}>
          A community database for flagging FACEIT match-fixers and game-throwers.
          Flagged players glow red on any FACEIT page — so you know who&apos;s in your lobby
          before the match starts.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1.5rem", alignItems: "center" }}>
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-lg"
            style={{
              background: "linear-gradient(180deg,#ff4444 0%,#cc0000 100%)",
              boxShadow: "0 4px 18px rgba(204,0,0,.35)",
              color: "#fff",
            }}
          >
            <ChromeIcon />
            Add to Chrome — Free
          </a>
          <span className="muted" style={{ fontSize: "0.8rem" }}>
            Coming soon to Chrome Web Store
          </span>
        </div>
      </div>

      {/* ── Mockup 1: match room ── */}
      <section style={{ marginBottom: "3rem" }}>
        <p className="muted" style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
          Preview — Match room on faceit.com
        </p>
        <FaceitMatchMockup />
        <p className="muted" style={{ fontSize: "0.82rem", marginTop: "0.75rem" }}>
          Flagged players are highlighted automatically. Hover a badge to see the community reports.
        </p>
      </section>

      {/* How it works */}
      <section style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ marginTop: 0 }}>How it works</h2>
        <ol className="steps" style={{ maxWidth: "36rem" }}>
          <li>
            <span className="step-n">1</span>
            <span>
              <strong>Play a match — no sign-up required.</strong>{" "}
              When you open a matchroom on FACEIT, the extension checks whether your
              logged-in FACEIT account is one of the 10 players in the room. If it is,
              a small{" "}
              <span style={{ fontWeight: 900, color: "#888" }}>⚑</span>
              {" "}flag button appears next to each other player&apos;s name. No account,
              email, or separate login needed — your presence in the match is the proof.
            </span>
          </li>
          <li>
            <span className="step-n">2</span>
            <span>
              <strong>Click ⚑, pick a rank, leave a comment.</strong>{" "}
              An inline panel opens next to the player&apos;s name. Choose a severity
              from S (confirmed account seller) down to F (minor one-time incident)
              and write a short reason. The flag is submitted to the community database
              under your anonymous reporter ID — your FACEIT identity is never stored or sent.
            </span>
          </li>
          <li>
            <span className="step-n">3</span>
            <span>
              <strong>Highlights appear everywhere on FACEIT.</strong>{" "}
              Flagged players&apos; names glow in rank-colored text with a badge like{" "}
              <code style={{ color: "#cc0000", fontWeight: 700, background: "#1a0000", padding: "1px 5px", borderRadius: 3 }}>[S]</code>
              {" "}on any FACEIT page — match rooms, scoreboards, player profiles — with a
              tooltip showing the community reports.
            </span>
          </li>
          <li>
            <span className="step-n">4</span>
            <span>
              <strong>Search before you queue.</strong>{" "}
              Use the popup to look up any nickname instantly and see their community rank,
              report count, and the most-cited reason — without loading their profile.
            </span>
          </li>
        </ol>
      </section>

      {/* ── Mockup 2: popup ── */}
      <section style={{ marginBottom: "3rem" }}>
        <p className="muted" style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
          Preview — Extension popup
        </p>
        <PopupMockup />
      </section>

      {/* Rank system */}
      <section style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ marginTop: 0 }}>Rank system</h2>
        <p className="muted" style={{ marginBottom: "1rem" }}>
          S is the worst offender. F is the least severe. Community consensus determines the displayed rank.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "36rem" }}>
          {RANKS.map(({ rank, color, border, label, desc }) => (
            <div
              key={rank}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.85rem",
                background: "#141414",
                border: `1px solid ${border}`,
                borderLeft: `3px solid ${color}`,
                borderRadius: 8,
                padding: "0.6rem 0.9rem",
              }}
            >
              <span style={{ fontWeight: 900, fontSize: "1rem", color, width: "1.4rem", textAlign: "center", flexShrink: 0 }}>{rank}</span>
              <span style={{ fontWeight: 700, color: "#ddd", flexShrink: 0, width: "5rem" }}>{label}</span>
              <span style={{ color: "#888", fontSize: "0.88rem" }}>{desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Privacy callout */}
      <section
        className="card"
        style={{ background: "rgba(102,192,244,0.05)", borderColor: "rgba(102,192,244,0.15)", marginBottom: "2rem" }}
      >
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>No account. No login. Verified by the match.</h2>
        <p style={{ margin: 0, fontSize: "0.92rem" }}>
          Instead of creating an account, the extension verifies you were actually in the match —
          it reads your logged-in FACEIT session directly from the page and checks your nickname
          against the room&apos;s player list. This happens entirely in your browser; your FACEIT
          username is never sent to our servers. Flags are attributed only to a random anonymous ID
          generated on install, and you can remove them at any time from the popup.{" "}
          <a href="/privacy/extension">Read the full privacy policy →</a>
        </p>
      </section>

      {/* CTA */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <a
          href={CHROME_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn"
          style={{
            background: "linear-gradient(180deg,#ff4444 0%,#cc0000 100%)",
            boxShadow: "0 4px 18px rgba(204,0,0,.25)",
            color: "#fff",
          }}
        >
          <ChromeIcon />
          Add to Chrome
        </a>
        <a href="/" className="btn btn-ghost">Back to Steam tracker</a>
      </div>
    </main>
  );
}

// ── FACEIT match-room mockup ─────────────────────────────────────────────────

function FaceitMatchMockup() {
  return (
    <div style={{
      background: "#161616",
      border: "1px solid #2a2a2a",
      borderRadius: 10,
      overflow: "hidden",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      maxWidth: 700,
    }}>
      {/* FACEIT top bar */}
      <div style={{ background: "#1f1f1f", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #2a2a2a" }}>
        <div style={{ fontWeight: 900, fontSize: 13, color: "#ff5500", letterSpacing: "0.05em" }}>FACEIT</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: "#555" }}>CS2 · 5v5 · Match #8472915</div>
      </div>

      {/* Teams header */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "12px 16px", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#5b9bd5", letterSpacing: "0.06em", textTransform: "uppercase" }}>Team CT</div>
        <div style={{ fontSize: 11, color: "#444", textAlign: "center" }}>vs</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#d5885b", letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "right" }}>Team T</div>
      </div>

      {/* Player rows */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderTop: "1px solid #222" }}>
        <div style={{ borderRight: "1px solid #222" }}>
          {TEAM_CT.map((p, i) => <PlayerRow key={i} player={p} side="ct" />)}
        </div>
        <div>
          {TEAM_T.map((p, i) => <PlayerRow key={i} player={p} side="t" />)}
        </div>
      </div>

      {/* Legend */}
      <div style={{ background: "#1a0000", borderTop: "1px solid #330000", padding: "7px 16px", display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ff3333", boxShadow: "0 0 5px rgba(255,51,51,.8)" }} />
        <span style={{ fontSize: 10, color: "#cc4444", letterSpacing: "0.06em" }}>ELO TERRORISTS — 3 flagged players detected in this lobby</span>
      </div>
    </div>
  );
}

type Player = {
  name: string;
  elo: number;
  flag: { rank: string; color: string; glow: string; comment: string } | null;
};

function PlayerRow({ player, side }: { player: Player; side: "ct" | "t" }) {
  const { name, elo, flag } = player;
  const align = side === "t" ? "right" : "left";
  const flexDir = side === "t" ? "row-reverse" : "row";

  return (
    <div style={{
      display: "flex",
      flexDirection: flexDir,
      alignItems: "center",
      gap: 8,
      padding: "7px 12px",
      borderBottom: "1px solid #1e1e1e",
    }}>
      {/* Avatar placeholder */}
      <div style={{
        width: 28, height: 28, borderRadius: 5,
        background: flag ? `${flag.color}22` : "#252525",
        border: `1px solid ${flag ? flag.color + "55" : "#333"}`,
        flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 700, color: flag ? flag.color : "#555",
      }}>
        {name[0].toUpperCase()}
      </div>

      {/* Name + badge */}
      <div style={{ flex: 1, minWidth: 0, textAlign: align }}>
        <div style={{
          fontSize: 12,
          fontWeight: flag ? 700 : 500,
          color: flag ? flag.color : "#c0c0c0",
          textShadow: flag ? `0 0 6px ${flag.glow}` : "none",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {name}
          {flag && (
            <span
              title={`Rank ${flag.rank} · ${flag.comment}`}
              style={{
                marginLeft: 4,
                fontSize: 10, fontWeight: 900,
                color: flag.color,
                letterSpacing: "0.04em",
                cursor: "help",
              }}
            >
              [{flag.rank}]
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: "#444", marginTop: 1 }}>{elo} ELO</div>
      </div>
    </div>
  );
}

// ── Popup mockup ─────────────────────────────────────────────────────────────

function PopupMockup() {
  return (
    <div style={{
      width: 390,
      background: "#0d0d0d",
      border: "1px solid #2a2a2a",
      borderRadius: 10,
      overflow: "hidden",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      fontSize: 13,
      color: "#e0e0e0",
      boxShadow: "0 16px 48px rgba(0,0,0,.6)",
    }}>
      <div style={{ padding: 12 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid #1e0000" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff3333", boxShadow: "0 0 5px rgba(255,51,51,.7)", flexShrink: 0 }} />
          <span style={{ fontWeight: 800, letterSpacing: "0.14em", color: "#ff4444", textTransform: "uppercase", flex: 1, fontSize: 13 }}>ELO TERRORISTS</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: "#555", border: "1px solid #2a2a2a", borderRadius: 3, padding: "2px 5px" }}>COMMUNITY DB</span>
        </div>

        {/* Search — flagged result */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: 1, background: "#181818", border: "1px solid #2a2a2a", borderRadius: 4, padding: "7px 10px", fontSize: 12, color: "#e0e0e0" }}>donk666</div>
            <div style={{ background: "#222", color: "#ccc", border: "1px solid #2a2a2a", borderRadius: 4, padding: "0 12px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center" }}>GO</div>
          </div>
          <div style={{ marginTop: 8, background: "#1a0000", border: "1px solid #440000", borderLeft: "3px solid #ff3333", borderRadius: 4, padding: "9px 11px", fontSize: 12, lineHeight: 1.5 }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#cc0000" }}>donk666</span>
              <span style={{ fontWeight: 600, marginLeft: 6, color: "#cc0000" }}>Rank S · 14 reports</span>
            </div>
            <div style={{ color: "#aaa", marginTop: 3 }}>Sold 3 games in a row. Account seller confirmed.</div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid #1e1e1e", margin: "10px 0" }} />

        {/* My flags */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "#555", textTransform: "uppercase" }}>MY FLAGS</span>
          <span style={{ fontSize: 10, color: "#444" }}>3</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {[
            { name: "donk666",       rank: "S", color: "#cc0000", comment: "Sold 3 games in a row. Account seller confirmed.", ago: "2d ago" },
            { name: "xXProSniper420", rank: "A", color: "#ff3333", comment: "Consistent AFK farming. 1-19 multiple games.",     ago: "5d ago" },
            { name: "rush_b_babyyy", rank: "B", color: "#ff6600", comment: "Frequent deagle headshots on own teammates.",       ago: "12d ago" },
          ].map(({ name, rank, color, comment, ago }) => (
            <div key={name} style={{ background: "#141414", border: `1px solid #1e0000`, borderLeft: `3px solid ${color}`, borderRadius: 4, padding: "7px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 900, color, border: `1px solid ${color}33`, background: "#1a0000", padding: "1px 5px", borderRadius: 3, flexShrink: 0 }}>{rank}</span>
                <span style={{ color: "#ddd", fontWeight: 700, fontSize: 13, flex: 1 }}>{name}</span>
                <span style={{ color: "#3a3a3a", fontSize: 13 }}>✕</span>
              </div>
              <div style={{ color: "#888", fontSize: 11, lineHeight: 1.4 }}>{comment}</div>
              <div style={{ color: "#3a3a3a", fontSize: 10, marginTop: 3 }}>Flagged {ago}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChromeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="currentColor" opacity=".9" />
      <path d="M12 8h9.5M4.5 19.5 9 11.5M14.5 19.5 10 11.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
