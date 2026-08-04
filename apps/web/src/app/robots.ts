import { canonicalUrl, getActiveDaoConfig } from "./_server/public-seo";

import type { MetadataRoute } from "next";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const config = await getActiveDaoConfig();
  const sitemapUrl = canonicalUrl(config, "/sitemap.xml");

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/proposals/new", "/profile", "/profile/edit", "/ai-analysis"],
    },
    sitemap: sitemapUrl ? [sitemapUrl] : undefined,
  };
}
