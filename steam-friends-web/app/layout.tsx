import type { Metadata } from "next";
import Script from "next/script";
import { getLocale } from "@/lib/locale";
import { getT } from "@/lib/i18n";
import LangSwitcher from "@/components/LangSwitcher";
import "./globals.css";

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
const SITE = process.env.APP_URL || "https://steamfriends.xyz";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "Steam Friends Tracker: See Who Unfriended You on Steam",
    template: "%s · Steam Friends Tracker",
  },
  description:
    "Free tool to track your Steam friends list and find out who unfriended or removed you. Sign in with Steam and we'll show you exactly who dropped you, and when.",
  keywords: [
    "steam friends tracker",
    "who unfriended me on steam",
    "steam unfriend tracker",
    "steam removed friend",
    "check steam friends",
    "steam friend list history",
    "did someone unfriend me steam",
    // Russian
    "кто удалил меня из друзей стим",
    "трекер друзей стим",
    "история друзей steam",
    // Chinese
    "Steam好友追踪",
    "谁删除了我的Steam好友",
    "Steam好友记录",
    // Turkish
    "steam arkadaş takip",
    "steam arkadaşlıktan kim çıkardı",
    "steam arkadaş silme takip",
  ],
  applicationName: "Steam Friends Tracker",
  alternates: {
    canonical: "/",
    languages: {
      en: `${SITE}/`,
      ru: `${SITE}/ru`,
      zh: `${SITE}/zh`,
      tr: `${SITE}/tr`,
    },
  },
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "Steam Friends Tracker",
    title: "See Who Unfriended You on Steam",
    description:
      "Track your Steam friends over time and find out who unfriended or removed you, for free.",
  },
  twitter: {
    card: "summary_large_image",
    title: "See Who Unfriended You on Steam",
    description:
      "Track your Steam friends over time and find out who unfriended or removed you, for free.",
  },
  robots: { index: true, follow: true },
  ...(ADSENSE_CLIENT ? { other: { "google-adsense-account": ADSENSE_CLIENT } } : {}),
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const T = getT(locale);

  return (
    <html lang={T.htmlLang}>
      <body>
        {children}
        <footer className="site-footer">
          <a href="/">{T.footHome}</a> · <a href="/privacy">{T.footPrivacy}</a> ·{" "}
          <a href="mailto:help@steamfriends.xyz">{T.footContact}</a> ·{" "}
          <span>{T.footDisclaimer}</span>
          <span className="lang-switcher-wrap">
            <LangSwitcher current={locale} />
          </span>
        </footer>

        {/* AdSense — EEA/UK/CH consent handled by Google's own CMP via this tag. */}
        {ADSENSE_CLIENT && (
          <Script
            id="adsbygoogle-js"
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
          />
        )}
      </body>
    </html>
  );
}
