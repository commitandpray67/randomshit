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
            <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z" />
          </svg>
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
