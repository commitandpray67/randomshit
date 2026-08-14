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
  mockupLabel1: "预览 — faceit.com 比赛房间",
  mockupCaption1:
    "被标记的玩家会自动高亮显示。悬停在徽章上可查看社区举报详情。",
  howTitle: "工作原理",
  step1Title: "使用 FACEIT 登录。",
  step1BodyA: "只需连接一次 FACEIT 账号——登录在 FACEIT 自己的页面完成，扩展程序绝不会看到你的密码。打开你参与过的比赛房间，每位其他玩家的名字旁就会出现一个",
  step1BodyB: "按钮。在接受举报之前，我们的服务器会核实你确实在该场比赛的名单中。",
  step2Title: "点击 ⚑，选择等级，留下评论。",
  step2Body:
    "玩家名字旁会打开一个面板。从 S（已确认的账号卖家）到 F（轻微的一次性事件）中选择严重程度，并写下简短理由。你的 FACEIT 账号只以不可逆的哈希形式保存，因此举报无法追溯到你——但你仍可在弹窗中查看并删除自己提交的举报。",
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
  privacyTitle: "举报者经过验证，举报内容匿名。",
  privacyBody:
    "提交举报需要使用 FACEIT 登录，并且我们的服务器会先确认你在该场比赛的名单中——正是这一点让数据库不会沦为匿名报复的工具。你的 FACEIT 账号 ID 绝不会以可读形式存储，服务器只保留不可逆的哈希值，仅够用于让你删除自己提交的举报。页面上可见的玩家昵称会发送到我们的 API，用于查询其 Steam ID 和社区评级。",
  privacyLink: "阅读完整隐私政策 →",
  ctaBack: "返回 Steam 追踪器",
  backHref: "/zh",
  privacyHref: "/privacy/extension",
};

export default function ExtensionPageZh() {
  return <ExtensionPageContent s={s} />;
}
