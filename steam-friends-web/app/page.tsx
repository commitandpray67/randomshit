import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getLocale } from "@/lib/locale";
import { getT } from "@/lib/i18n";
import AdSlot from "@/components/AdSlot";
import LandingContent from "@/components/LandingContent";

const SITE = process.env.APP_URL || "https://steamfriends.xyz";

export default async function Home() {
  const steamId = await getSession();
  if (steamId) redirect("/dashboard");

  const locale = await getLocale();
  const T = getT(locale);

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
      <LandingContent T={T} />
      <AdSlot />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd) }}
      />
    </main>
  );
}
