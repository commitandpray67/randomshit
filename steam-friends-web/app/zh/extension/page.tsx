import type { Metadata } from "next";
import ExtensionPageContent, { type ExtensionStrings } from "@/components/ExtensionPageContent";

const SITE = process.env.APP_URL || "https://steamfriends.xyz";

export const metadata: Metadata = {
  title: "ELO TERRORISTS — FACEIT CS2 Chrome 扩展程序",
  description:
    "社区驱动的 Chrome 扩展程序，用于标记 FACEIT 对局操纵者和游戏破坏者。被标记玩家在任何 FACEIT 页面上高亮显示——在比赛开始前了解对手。",
  alternates: {
    canonical: `${SITE}/zh/extension`,
    languages: {
      en: `${SITE}/extension`,
      ru: `${SITE}/ru/extension`,
      zh: `${SITE}/zh/extension`,
      tr: `${SITE}/tr/extension`,
      es: `${SITE}/es/extension`,
    },
  },
};

const s: ExtensionStrings = {
  heroEyebrow: "Chrome 扩展程序 · FACEIT CS2",
  heroSub:
    "一个用于标记 FACEIT 对局操纵者和游戏破坏者的社区数据库。被标记玩家会在任何 FACEIT 页面上亮红——在比赛开始前了解你将与谁对决。",
  ctaLabel: "免费添加至 Chrome",
  ctaComingSoon: "即将上线 Chrome 网上应用店",
  mockupLabel1: "预览 — faceit.com 比赛房间",
  mockupCaption1:
    "被标记的玩家会自动高亮显示。悬停在徽章上可查看社区举报详情。",
  howTitle: "工作原理",
  step1Title: "参加比赛 — 无需注册。",
  step1BodyA:
    "当你打开 FACEIT 上的比赛房间时，扩展程序会检测你的登录账号是否是房间内 10 名玩家之一。如果是，其他每位玩家的名字旁边会出现",
  step1BodyB:
    "举报按钮。无需账号、邮箱或额外登录——你在比赛中的存在即为验证。",
  step2Title: "点击 ⚑，选择等级，留下评论。",
  step2Body:
    "玩家名字旁会弹出一个内联面板。选择严重程度，从 S（确认账号出售者）到 F（轻微一次性事件），并写一个简短的理由。举报以匿名记者 ID 提交至社区数据库——你的 FACEIT 身份信息不会被存储或发送。",
  step3Title: "高亮显示在 FACEIT 全站生效。",
  step3BodyA:
    "被标记玩家的名字会以对应等级的颜色发光，附带如",
  step3BodyB:
    "这样的徽章，显示在 FACEIT 任何页面——比赛房间、积分榜和玩家主页——以及显示社区举报的提示框。",
  step4Title: "入队前先搜索。",
  step4Body:
    "使用扩展程序弹窗即时查找任意昵称，查看其社区等级、举报数量及最常被提及的原因——无需加载玩家主页。",
  mockupLabel2: "预览 — 扩展程序弹窗",
  rankTitle: "等级体系",
  rankSub: "S 是最严重的违规者，F 是最轻微的。社区共识决定显示的等级。",
  rankRows: [
    { label: "极严重", desc: "确认账号出售者 / 为金钱故意输球" },
    { label: "严重",   desc: "持续故意输球，AFK 挂机刷分" },
    { label: "高度",   desc: "频繁故意输球，明显破坏比赛" },
    { label: "中度",   desc: "可疑行为，反复出现差劲表现" },
    { label: "轻度",   desc: "疑似恶意玩家，存在轻微反复问题" },
    { label: "极轻",   desc: "一次性事件或情况不明" },
  ],
  privacyTitle: "无需账号。无需登录。通过比赛验证。",
  privacyBody:
    "无需注册账号，扩展程序通过验证你是否真实参与比赛来建立信任——它直接从页面读取你的 FACEIT 登录会话，并将你的昵称与比赛玩家列表进行核对。整个过程完全在你的浏览器内完成；你的 FACEIT 用户名永远不会发送到我们的服务器。举报仅与安装时生成的随机匿名 ID 关联，你随时可以通过弹窗删除它们。",
  privacyLink: "阅读完整隐私政策 →",
  ctaBack: "返回 Steam 追踪器",
  backHref: "/zh",
  privacyHref: "/privacy/extension",
};

export default function ExtensionPageZh() {
  return <ExtensionPageContent s={s} />;
}
