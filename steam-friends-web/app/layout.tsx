import type { Metadata } from "next";
import Consent from "@/components/Consent";
import "./globals.css";

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

export const metadata: Metadata = {
  title: "Steam Friends Tracker — see who unfriended you",
  description:
    "Sign in with Steam and we'll remember your friends list, so you can find out later who unfriended you.",
  // Ownership marker for AdSense site verification (the "Meta tag" method).
  // Renders <meta name="google-adsense-account" content="ca-pub-..."> in <head>.
  // No ad script or cookie — safe to show to everyone, unlike the ad loader
  // which stays gated behind consent.
  ...(ADSENSE_CLIENT ? { other: { "google-adsense-account": ADSENSE_CLIENT } } : {}),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="site-footer">
          <a href="/">Home</a> · <a href="/privacy">Privacy</a> ·{" "}
          <span>Not affiliated with Steam or Valve.</span>
        </footer>

        {/* Shows a cookie banner and loads AdSense only after consent.
            Renders nothing unless NEXT_PUBLIC_ADSENSE_CLIENT is set. */}
        <Consent />
      </body>
    </html>
  );
}
