import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import AdSlot from "@/components/AdSlot";

export default async function Home() {
  const steamId = await getSession();
  if (steamId) redirect("/dashboard");

  return (
    <main>
      <div className="hero">
        <div className="logo">🎮</div>
        <h1>Steam Friends Tracker</h1>
        <p className="sub">
          We remember your Steam friends list, so you can find out later
          who quietly unfriended you.
        </p>
        <a className="btn" href="/api/auth/steam">
          <span>Sign in through Steam</span>
        </a>
      </div>

      <div className="features">
        <div className="card feature">
          <div className="ico">📸</div>
          <h3>Snapshot</h3>
          <p>Sign in once and we save who your friends are right now.</p>
        </div>
        <div className="card feature">
          <div className="ico">🔍</div>
          <h3>Detect changes</h3>
          <p>Come back anytime to see who was added, and who unfriended you.</p>
        </div>
        <div className="card feature">
          <div className="ico">🗓️</div>
          <h3>Daily checks</h3>
          <p>We re-check every day, so a removal is caught even while you&apos;re away.</p>
        </div>
      </div>

      <div className="card notice info" style={{ marginTop: "2rem" }}>
        <strong>One requirement:</strong> your Steam <em>friends list</em> must be
        set to <em>Public</em> (Steam → Edit Profile → Privacy Settings → My
        friends list → Public). Steam doesn&apos;t let any third-party app read a
        private friends list — not even your own.
      </div>

      <AdSlot />

      <p className="muted" style={{ textAlign: "center", marginTop: "1.5rem" }}>
        Not affiliated with Steam or Valve.
      </p>
    </main>
  );
}
