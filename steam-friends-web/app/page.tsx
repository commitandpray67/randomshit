import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import AdSlot from "@/components/AdSlot";

const SITE = process.env.APP_URL || "https://steamfriends.xyz";

export default async function Home() {
  const steamId = await getSession();
  if (steamId) redirect("/dashboard");

  const appJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Steam Friends Tracker",
    url: SITE,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description:
      "Track your Steam friends list and find out who unfriended or removed you.",
  };

  return (
    <main>
      <div className="hero">
        <h1>See who unfriended you on Steam</h1>
        <p className="sub">
          Steam never tells you when someone removes you. Sign in and we&apos;ll
          remember your friends list, so you can find out exactly who unfriended
          you, and when.
        </p>
        <a className="btn" href="/api/auth/steam">
          <span>Sign in through Steam</span>
        </a>
      </div>

      <div className="features">
        <div className="card feature">
          <h3>Snapshot your friends</h3>
          <p>Sign in once and we save exactly who your Steam friends are right now.</p>
        </div>
        <div className="card feature">
          <h3>Catch unfriends</h3>
          <p>Come back anytime to see who was added, and who quietly removed you.</p>
        </div>
        <div className="card feature">
          <h3>Automatic daily checks</h3>
          <p>We re-check every day, so a removal is caught even while you&apos;re away.</p>
        </div>
      </div>

      <AdSlot />

      <h2>How to see who unfriended you on Steam</h2>
      <ol className="steps">
        <li>
          Set your Steam <strong>friends list to Public</strong> (Steam → Edit
          Profile → Privacy Settings → My friends list → Public).
        </li>
        <li>
          Click <strong>Sign in through Steam</strong> above. No password is
          shared, only your public SteamID.
        </li>
        <li>
          We save a baseline of your current friends. Check back later and
          we&apos;ll highlight anyone who <strong>unfriended or removed you</strong>.
        </li>
      </ol>

      <div className="card notice info">
        <strong>One requirement:</strong> your Steam <em>friends list</em> must be
        set to <em>Public</em>. Steam doesn&apos;t let any third-party app read a
        private friends list, not even your own.
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd) }}
      />
    </main>
  );
}
