import type { MetadataRoute } from "next";

const SITE = process.env.APP_URL || "https://steamfriends.xyz";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/ru`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/zh`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
