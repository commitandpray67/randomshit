import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Steam Friends Tracker — see who unfriended you",
  description:
    "Sign in with Steam and we'll remember your friends list, so you can find out later who unfriended you.",
};

// Set NEXT_PUBLIC_ADSENSE_CLIENT (e.g. "ca-pub-1234567890123456") in your
// environment once your AdSense account is approved. Until then, no ad code
// loads at all.
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="site-footer">
          <a href="/">Home</a> · <a href="/privacy">Privacy</a> ·{" "}
          <span>Not affiliated with Steam or Valve.</span>
        </footer>

        {ADSENSE_CLIENT && (
          <Script
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
