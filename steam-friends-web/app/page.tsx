import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import AdSlot from "@/components/AdSlot";

const SITE = process.env.APP_URL || "https://steamfriends.xyz";

const faqs = [
  {
    q: "How can I see who unfriended me on Steam?",
    a: "Steam has no built-in way to see who removed you. Steam Friends Tracker saves a snapshot of your friends list when you sign in, then compares it on later visits (and once a day automatically) to show you exactly who unfriended you.",
  },
  {
    q: "Does Steam notify you when someone unfriends you?",
    a: "No. Steam removes them silently, and you just quietly have one fewer friend. That's the whole reason this tool exists: it remembers your list so a removal doesn't go unnoticed.",
  },
  {
    q: "Is it free?",
    a: "Yes, Steam Friends Tracker is completely free to use.",
  },
  {
    q: "Do I need to make my friends list public?",
    a: "Yes. Steam only lets third-party apps read a friends list that is set to Public. Not even your own private list is readable. Set 'My friends list' to Public in your Steam privacy settings first.",
  },
  {
    q: "Is my account safe? Do you get my password?",
    a: "We never see your password. Sign-in happens on Steam's own servers through Steam OpenID; we only receive your public SteamID. We read only information Steam already exposes publicly.",
  },
];

export default async function Home() {
  const steamId = await getSession();
  if (steamId) redirect("/dashboard");

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

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

      <h2>Frequently asked questions</h2>
      <div className="card">
        {faqs.map((f) => (
          <details key={f.q} className="faq">
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>

      <div className="card notice info">
        <strong>One requirement:</strong> your Steam <em>friends list</em> must be
        set to <em>Public</em>. Steam doesn&apos;t let any third-party app read a
        private friends list, not even your own.
      </div>

      <p className="muted" style={{ textAlign: "center", marginTop: "1.5rem" }}>
        Not affiliated with Steam or Valve.
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd) }}
      />
    </main>
  );
}
