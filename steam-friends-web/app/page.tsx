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
        <h1>See who unfriended you on Steam</h1>
        <p className="sub">
          Steam never tells you when someone removes you. Sign in and we&apos;ll
          remember your friends list, so you can see exactly who unfriended you,
          and when.
        </p>
        <a className="btn btn-lg" href="/api/auth/steam">
          Sign in through Steam
        </a>
        <p className="trust">
          No password shared. We only read your public SteamID via Steam OpenID.
        </p>
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
