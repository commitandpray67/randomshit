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
    <main className="landing">
      <section className="hero">
        <span className="hero-badge">Free · Checked daily</span>
        <h1>
          See who <span className="accent">unfriended you</span> on Steam
        </h1>
        <p className="sub">
          Steam never tells you when someone removes you. Sign in and we&apos;ll
          remember your friends list, so you can see exactly who unfriended you,
          and when.
        </p>
        <a className="btn btn-lg" href="/api/auth/steam">
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2a10 10 0 0 0-9.96 9.13l5.36 2.21a2.83 2.83 0 0 1 1.6-.49h.14l2.39-3.45v-.05a3.77 3.77 0 1 1 3.77 3.77h-.09l-3.4 2.43v.12a2.83 2.83 0 1 1-5.66.13v-.02l-3.83-1.58A10 10 0 1 0 12 2Zm-4.7 13.6 1.23.51a2.12 2.12 0 1 0 1.09-2.28l-1.27-.52a2.12 2.12 0 0 0-1.05 2.29Zm10-6.09a2.51 2.51 0 1 0-2.51 2.51 2.51 2.51 0 0 0 2.51-2.51Zm-4.4 0a1.89 1.89 0 1 1 1.89 1.88 1.88 1.88 0 0 1-1.89-1.88Z" />
          </svg>
          Sign in through Steam
        </a>
        <div className="trust-chips">
          <span className="chip">No password shared</span>
          <span className="chip">Steam OpenID sign-in</span>
          <span className="chip">Public profile data only</span>
        </div>
      </section>

      <section className="how">
        <h2>How to see who unfriended you on Steam</h2>
        <ol className="steps">
          <li>
            <span className="step-n">1</span>
            <span>
              Set your Steam <strong>friends list to Public</strong> (Edit
              Profile → Privacy Settings → My friends list). Steam won&apos;t let
              any app read a private list, not even your own.
            </span>
          </li>
          <li>
            <span className="step-n">2</span>
            <span>
              Click <strong>Sign in through Steam</strong> above. We save a
              baseline snapshot of your current friends.
            </span>
          </li>
          <li>
            <span className="step-n">3</span>
            <span>
              Come back anytime, or let the daily check run, and we&apos;ll
              highlight anyone who <strong>unfriended or removed you</strong>.
            </span>
          </li>
        </ol>
      </section>

      <AdSlot />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd) }}
      />
    </main>
  );
}
