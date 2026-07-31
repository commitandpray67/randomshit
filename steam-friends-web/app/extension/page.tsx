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

      {/* How it works */}
      <section style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ marginTop: 0 }}>How it works</h2>
        <ol className="steps" style={{ maxWidth: "36rem" }}>
          <li>
            <span className="step-n">1</span>
            <span>
              <strong>Flag a player.</strong>{" "}
              Type their FACEIT nickname into the popup. The extension looks up their
              linked Steam ID — the one permanent identifier that survives nickname changes —
              and stores the flag in a shared community database.
            </span>
          </li>
          <li>
            <span className="step-n">2</span>
            <span>
              <strong>Assign a rank and leave a comment.</strong>{" "}
              Choose a rank from S (confirmed account seller) down to F (minor one-time incident)
              and write a short reason. The comment helps others understand the context.
            </span>
          </li>
          <li>
            <span className="step-n">3</span>
            <span>
              <strong>Highlights appear automatically.</strong>{" "}
              On any FACEIT page — match room, scoreboard, player profile — flagged players&apos;
              names glow in rank-colored text with a badge like{" "}
              <code style={{ color: "#cc0000", fontWeight: 700, background: "#1a0000", padding: "1px 5px", borderRadius: 3 }}>[S]</code>
              {" "}and a tooltip showing the community reports.
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
              <span style={{
                fontWeight: 900, fontSize: "1rem", color,
                width: "1.4rem", textAlign: "center", flexShrink: 0,
              }}>{rank}</span>
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
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Anonymous by design</h2>
        <p style={{ margin: 0, fontSize: "0.92rem" }}>
          The extension generates a random ID on install — no account, email, or login required.
          Your identity is never stored or shared. Flags you submit are tied only to that random ID,
          and you can remove them at any time from the popup.{" "}
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

function ChromeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="currentColor" opacity=".9" />
      <path d="M12 8h9.5M4.5 19.5 9 11.5M14.5 19.5 10 11.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
