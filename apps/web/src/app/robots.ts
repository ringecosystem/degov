import { routing } from "@/i18n/routing";

import { canonicalUrl, getActiveDaoConfig } from "./_server/public-seo";

import type { MetadataRoute } from "next";

const PRIVATE_ROUTES = [
  "/proposals/new",
  "/proposals/drafts",
  "/profile",
  "/profile/edit",
  "/ai-analysis",
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const config = await getActiveDaoConfig();
  const sitemapUrl = canonicalUrl(config, "/sitemap.xml");
  const localizedPrivateRoutes = routing.locales.flatMap((locale) =>
    PRIVATE_ROUTES.map((route) => `/${locale}${route}`)
  );

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...PRIVATE_ROUTES, ...localizedPrivateRoutes],
    },
    sitemap: sitemapUrl ? [sitemapUrl] : undefined,
  };
}
