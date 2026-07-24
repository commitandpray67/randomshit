import type { Metadata } from "next";
import Consent from "@/components/Consent";
import "./globals.css";

export const metadata: Metadata = {
  title: "Steam Friends Tracker — see who unfriended you",
  description:
    "Sign in with Steam and we'll remember your friends list, so you can find out later who unfriended you.",
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
