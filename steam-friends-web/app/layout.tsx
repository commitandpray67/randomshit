import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Steam Friends Tracker",
  description: "See who unfriended you on Steam.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
