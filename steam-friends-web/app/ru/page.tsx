import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getT } from "@/lib/i18n";
import AdSlot from "@/components/AdSlot";
import LandingContent from "@/components/LandingContent";

const SITE = process.env.APP_URL || "https://steamfriends.xyz";
const T = getT("ru");

export const metadata: Metadata = {
  title: "Трекер Друзей Steam: Кто Удалил Тебя из Друзей?",
  description:
    "Бесплатный инструмент для отслеживания списка друзей Steam. Войди через Steam и узнай, кто удалил тебя из друзей и когда именно это произошло.",
  keywords: [
    "кто удалил меня из друзей стим",
    "трекер друзей стим",
    "кто убрал из друзей стим",
    "история друзей steam",
    "отслеживание друзей стим",
    "стим трекер друзей",
    "кто удалил из стим",
    "steam друзья история",
    "проверить список друзей стим",
  ],
  alternates: {
    canonical: `${SITE}/ru`,
    languages: { en: `${SITE}/`, ru: `${SITE}/ru`, zh: `${SITE}/zh`, tr: `${SITE}/tr` },
  },
  openGraph: {
    type: "website",
    url: `${SITE}/ru`,
    siteName: "Steam Friends Tracker",
    title: "Трекер Друзей Steam: Кто Удалил Тебя из Друзей?",
    description: "Войди через Steam и узнай, кто удалил тебя из друзей и когда.",
  },
};

export default async function RuPage() {
  const steamId = await getSession();
  if (steamId) redirect("/dashboard");

  return (
    <main className="landing">
      <LandingContent T={T} />
      <AdSlot />
    </main>
  );
}
