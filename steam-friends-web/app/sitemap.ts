import type { MetadataRoute } from "next";

const SITE = process.env.APP_URL || "https://steamfriends.xyz";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/ru`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/zh`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/tr`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/es`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/extension`,    changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/ru/extension`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/zh/extension`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/tr/extension`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/es/extension`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    // Linked from the Chrome Web Store listing, so they need to be reachable
    // and indexable rather than hidden behind noindex.
    { url: `${SITE}/privacy/extension`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/tos/extension`,     changeFrequency: "yearly", priority: 0.3 },
  ];
}
