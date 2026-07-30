import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getT } from "@/lib/i18n";
import AdSlot from "@/components/AdSlot";
import LandingContent from "@/components/LandingContent";

const SITE = process.env.APP_URL || "https://steamfriends.xyz";
const T = getT("es");

export const metadata: Metadata = {
  title: "Steam Friends Tracker: Ve Quién Te Eliminó de Amigos en Steam",
  description:
    "Herramienta gratuita para rastrear tu lista de amigos de Steam. Inicia sesión con Steam y descubre quién te eliminó de amigos y exactamente cuándo ocurrió.",
  keywords: [
    "tracker amigos steam",
    "quien me elimino de amigos en steam",
    "steam amigos eliminados",
    "rastrear amigos steam",
    "quien me quito de amigos steam",
    "historial amigos steam",
    "steam lista de amigos",
    "amigos steam eliminados rastreador",
    "ver quien me elimino steam",
  ],
  alternates: {
    canonical: `${SITE}/es`,
    languages: { en: `${SITE}/`, ru: `${SITE}/ru`, zh: `${SITE}/zh`, tr: `${SITE}/tr`, es: `${SITE}/es` },
  },
  openGraph: {
    type: "website",
    url: `${SITE}/es`,
    siteName: "Steam Friends Tracker",
    title: "Steam Friends Tracker: Ve Quién Te Eliminó de Amigos en Steam",
    description: "Inicia sesión con Steam y descubre quién te eliminó de amigos y cuándo.",
  },
};

export default async function EsPage() {
  const steamId = await getSession();
  if (steamId) redirect("/dashboard");

  return (
    <main className="landing">
      <LandingContent T={T} />
      <AdSlot />
    </main>
  );
}
