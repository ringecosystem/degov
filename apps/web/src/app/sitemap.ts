import { canonicalUrl, getActiveDaoConfig, getSitemapProposalIds } from "./_server/public-seo";

import type { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const config = await getActiveDaoConfig();
  const homeUrl = canonicalUrl(config, "/");
  const proposalsUrl = canonicalUrl(config, "/proposals");

  if (!homeUrl || !proposalsUrl) {
    return [];
  }

  const proposalIds = await getSitemapProposalIds(config);

  return [
    {
      url: homeUrl,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: proposalsUrl,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    ...proposalIds.flatMap((proposalId) => {
      const url = canonicalUrl(config, `/proposal/${proposalId}`);
      return url
        ? [
            {
              url,
              changeFrequency: "weekly" as const,
              priority: 0.7,
            },
          ]
        : [];
    }),
  ];
}
