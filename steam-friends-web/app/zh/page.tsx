import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import AdSlot from "@/components/AdSlot";

const SITE = process.env.APP_URL || "https://steamfriends.xyz";

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
    languages: {
      en: `${SITE}/`,
      ru: `${SITE}/ru`,
      zh: `${SITE}/zh`,
    },
  },
  openGraph: {
    type: "website",
    url: `${SITE}/zh`,
    siteName: "Steam Friends Tracker",
    title: "Steam好友追踪器：查看谁删除了你",
    description:
      "通过Steam登录，查看谁删除了你的好友以及删除时间。",
  },
};

export default async function ZhPage() {
  const steamId = await getSession();
  if (steamId) redirect("/dashboard");

  return (
    <main className="landing">
      <section className="hero">
        <h1>查看谁在Steam上删除了你</h1>
        <p className="sub">
          Steam不会通知你有人删除了你。登录后，我们会记录你的好友列表，精确显示谁删除了你，以及何时删除。
        </p>
        <a className="btn btn-lg" href="/api/auth/steam">
          通过Steam登录
        </a>
        <p className="trust">
          无需密码。我们仅通过Steam OpenID读取你的公开SteamID。
        </p>
      </section>

      <section className="how">
        <h2>如何查看谁删除了你的Steam好友</h2>
        <ol className="steps">
          <li>
            <span className="step-n">1</span>
            <span>
              打开Steam<strong>隐私设置</strong>，将「我的好友列表」设为「公开」。Steam不允许任何应用读取私密列表。
            </span>
          </li>
          <li>
            <span className="step-n">2</span>
            <span>
              点击上方<strong>「通过Steam登录」</strong>。我们将保存你当前好友列表的快照。
            </span>
          </li>
          <li>
            <span className="step-n">3</span>
            <span>
              随时回来查看，或等待每日自动检查。我们会显示所有{" "}
              <strong>删除了你的人</strong>。
            </span>
          </li>
        </ol>
      </section>

      <AdSlot />
    </main>
  );
}
