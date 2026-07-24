import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getT } from "@/lib/i18n";
import AdSlot from "@/components/AdSlot";
import LandingContent from "@/components/LandingContent";

const SITE = process.env.APP_URL || "https://steamfriends.xyz";
const T = getT("zh");

export const metadata: Metadata = {
  title: "Steam好友追踪器：查看谁删除了你",
  description:
    "免费Steam好友追踪工具。通过Steam登录，查看谁删除了你的好友以及删除时间，掌握好友列表的所有变化。",
  keywords: [
    "Steam好友追踪",
    "谁删除了我的Steam好友",
    "Steam好友记录",
    "Steam取消好友追踪",
    "查看Steam好友变化",
    "Steam好友历史",
    "谁把我从Steam好友删除",
    "Steam好友列表追踪器",
    "Steam删除好友查询",
  ],
  alternates: {
    canonical: `${SITE}/zh`,
    languages: { en: `${SITE}/`, ru: `${SITE}/ru`, zh: `${SITE}/zh` },
  },
  openGraph: {
    type: "website",
    url: `${SITE}/zh`,
    siteName: "Steam Friends Tracker",
    title: "Steam好友追踪器：查看谁删除了你",
    description: "通过Steam登录，查看谁删除了你的好友以及删除时间。",
  },
};

export default async function ZhPage() {
  const steamId = await getSession();
  if (steamId) redirect("/dashboard");

  return (
    <main className="landing">
      <LandingContent T={T} />
      <AdSlot />
    </main>
  );
}
