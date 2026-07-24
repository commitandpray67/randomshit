import type { MetadataRoute } from "next";

const SITE = process.env.APP_URL || "https://steamfriends.xyz";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private per-user page and API routes shouldn't be indexed.
      disallow: ["/dashboard", "/api/"],
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
