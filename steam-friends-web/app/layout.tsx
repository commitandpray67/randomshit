import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

export const metadata: Metadata = {
  title: "Steam Friends Tracker — see who unfriended you",
  description:
    "Sign in with Steam and we'll remember your friends list, so you can find out later who unfriended you.",
  // Ownership marker for AdSense site verification (the "Meta tag" method).
  ...(ADSENSE_CLIENT ? { other: { "google-adsense-account": ADSENSE_CLIENT } } : {}),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="site-footer">
          <a href="/">Home</a> · <a href="/privacy">Privacy</a> ·{" "}
          <a href="mailto:help@steamfriends.xyz">Contact</a> ·{" "}
          <span>Not affiliated with Steam or Valve.</span>
        </footer>

        {/* Load AdSense when configured. Consent for EEA/UK/CH visitors is
            handled by Google's own Consent Management Platform (CMP), which is
            served through this same tag — so no separate cookie banner. */}
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
