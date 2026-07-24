import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getT } from "@/lib/i18n";
import AdSlot from "@/components/AdSlot";
import LandingContent from "@/components/LandingContent";

const SITE = process.env.APP_URL || "https://steamfriends.xyz";
const T = getT("tr");

export const metadata: Metadata = {
  title: "Steam Arkadaş Takipçisi: Seni Kim Sildi?",
  description:
    "Ücretsiz Steam arkadaş takip aracı. Steam ile giriş yap, seni arkadaş listesinden çıkaranları ve ne zaman çıkardıklarını öğren.",
  keywords: [
    "steam arkadaş takip",
    "steam arkadaşlıktan kim çıkardı",
    "steam arkadaş silme takip",
    "steam arkadaş listesi geçmişi",
    "steam kim sildim",
    "steam arkadaş listesi kontrol",
    "steam arkadaşlık takipçisi",
    "steam arkadaş çıkarma",
    "steam arkadaş listesini kim terk etti",
  ],
  alternates: {
    canonical: `${SITE}/tr`,
    languages: {
      en: `${SITE}/`,
      ru: `${SITE}/ru`,
      zh: `${SITE}/zh`,
      tr: `${SITE}/tr`,
    },
  },
  openGraph: {
    type: "website",
    url: `${SITE}/tr`,
    siteName: "Steam Friends Tracker",
    title: "Steam Arkadaş Takipçisi: Seni Kim Sildi?",
    description:
      "Steam ile giriş yap, seni arkadaş listesinden çıkaranları ve ne zaman çıkardıklarını öğren.",
  },
};

export default async function TrPage() {
  const steamId = await getSession();
  if (steamId) redirect("/dashboard");

  return (
    <main className="landing">
      <LandingContent T={T} />
      <AdSlot />
    </main>
  );
}
