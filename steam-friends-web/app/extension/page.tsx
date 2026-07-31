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
  ctaComingSoon: "Coming soon to Chrome Web Store",
  mockupLabel1: "Preview — Match room on faceit.com",
  mockupCaption1:
    "Flagged players are highlighted automatically. Hover a badge to see the community reports.",
  howTitle: "How it works",
  step1Title: "Play a match — no sign-up required.",
  step1BodyA:
    "When you open a matchroom on FACEIT, the extension checks whether your logged-in FACEIT account is one of the 10 players in the room. If it is, a small",
  step1BodyB:
    "flag button appears next to each other player's name. No account, email, or separate login needed — your presence in the match is the proof.",
  step2Title: "Click ⚑, pick a rank, leave a comment.",
  step2Body:
    "An inline panel opens next to the player's name. Choose a severity from S (confirmed account seller) down to F (minor one-time incident) and write a short reason. The flag is submitted to the community database under your anonymous reporter ID — your FACEIT identity is never stored or sent.",
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
  privacyTitle: "No account. No login. Verified by the match.",
  privacyBody:
    "Instead of creating an account, the extension verifies you were actually in the match — it reads your logged-in FACEIT session directly from the page and checks your nickname against the room's player list. This happens entirely in your browser; your FACEIT username is never sent to our servers. Flags are attributed only to a random anonymous ID generated on install, and you can remove them at any time from the popup.",
  privacyLink: "Read the full privacy policy →",
  ctaBack: "Back to Steam tracker",
  backHref: "/",
  privacyHref: "/privacy/extension",
};

export default function ExtensionPage() {
  return <ExtensionPageContent s={s} />;
}
