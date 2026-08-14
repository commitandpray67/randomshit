import type { Metadata } from "next";
import ExtensionPageContent, { type ExtensionStrings } from "@/components/ExtensionPageContent";

const SITE = process.env.APP_URL || "https://steamfriends.xyz";

export const metadata: Metadata = {
  title: "ELO TERRORISTS — FACEIT Anti-Smurf Chrome Extension",
  description:
    "Community-powered Chrome extension that flags and highlights FACEIT match-fixers and game-throwers by their Steam ID. Know who you're playing with before the match starts.",
  alternates: {
    canonical: `${SITE}/extension`,
    languages: {
      en: `${SITE}/extension`,
      ru: `${SITE}/ru/extension`,
      zh: `${SITE}/zh/extension`,
      tr: `${SITE}/tr/extension`,
      es: `${SITE}/es/extension`,
    },
  },
  openGraph: {
    type: "website",
    url: `${SITE}/extension`,
    title: "ELO TERRORISTS — FACEIT Anti-Smurf Extension",
    description:
      "Flag match-fixers by Steam ID. Highlights flagged players on any FACEIT page so you can dodge before the match starts.",
  },
};

const s: ExtensionStrings = {
  heroEyebrow: "Chrome Extension · FACEIT CS2",
  heroSub:
    "A community database for flagging FACEIT match-fixers and game-throwers. Flagged players glow red on any FACEIT page — so you know who's in your lobby before the match starts.",
  ctaLabel: "Add to Chrome — Free",
  mockupLabel1: "Preview — Match room on faceit.com",
  mockupCaption1:
    "Flagged players are highlighted automatically. Hover a badge to see the community reports.",
  howTitle: "How it works",
  step1Title: "Sign in with FACEIT.",
  step1BodyA:
    "Connect your FACEIT account once, through FACEIT's own login page — the extension never sees your password. Open the matchroom of a game you played and a",
  step1BodyB:
    "button appears next to every other player's name. Our server checks that you were really on that match's roster before it accepts a report.",
  step2Title: "Click ⚑, pick a rank, leave a comment.",
  step2Body:
    "An inline panel opens next to the player's name. Choose a severity from S (confirmed account seller) down to F (minor one-time incident) and write a short reason. Your FACEIT account is stored only as a one-way hash, so a report cannot be traced back to you — but the popup still lets you review and delete your own.",
  step3Title: "Highlights appear everywhere on FACEIT.",
  step3BodyA:
    "Flagged players' names glow in rank-colored text with a badge like",
  step3BodyB:
    "on any FACEIT page — match rooms, scoreboards, player profiles — with a tooltip showing the community reports.",
  step4Title: "Search before you queue.",
  step4Body:
    "Use the popup to look up any nickname instantly and see their community rank, report count, and the most-cited reason — without loading their profile.",
  mockupLabel2: "Preview — Extension popup",
  rankTitle: "Rank system",
  rankSub:
    "S is the worst offender. F is the least severe. Community consensus determines the displayed rank.",
  rankRows: [
    { label: "Hardcore", desc: "Confirmed account seller / throwing for money" },
    { label: "Severe",   desc: "Consistent intentional losing, AFK farming" },
    { label: "High",     desc: "Frequent thrower, obvious game-throwing" },
    { label: "Mid",      desc: "Suspicious, repeated bad games" },
    { label: "Low",      desc: "Possible troll, minor recurring issues" },
    { label: "Minimal",  desc: "One-time incident or uncertain" },
  ],
  privacyTitle: "Verified reporters. Anonymous reports.",
  privacyBody:
    "Reporting requires signing in with FACEIT, and our server confirms you were on the match roster before accepting anything — that is what keeps the database from filling up with anonymous revenge reports. Your FACEIT account ID is never stored in readable form; only a one-way hash is kept, which is enough to let you delete your own reports and nothing more. Player nicknames visible on the page are sent to our API to look up their Steam IDs and community rank.",
  privacyLink: "Read the full privacy policy →",
  ctaBack: "Back to Steam tracker",
  backHref: "/",
  privacyHref: "/privacy/extension",
};

export default function ExtensionPage() {
  return <ExtensionPageContent s={s} />;
}
