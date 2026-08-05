import { buildHomeMetadata } from "@/lib/metadata";
import { buildDaoOrganizationJsonLd } from "@/lib/structured-data";

import { HomeClient } from "./_components/home-client";
import { DaoPublicSummary } from "./_components/public-route-summary";
import { getActiveDaoConfig } from "./_server/public-seo";

import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getActiveDaoConfig();
  return buildHomeMetadata(config);
}

export default async function HomePage() {
  const config = await getActiveDaoConfig();
  const daoOrganizationJsonLd = buildDaoOrganizationJsonLd(config);

  return (
    <div className="flex flex-col gap-[20px] lg:gap-[30px]">
      {daoOrganizationJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: daoOrganizationJsonLd }}
        />
      ) : null}
      <DaoPublicSummary config={config} />
      <HomeClient />
    </div>
  );
}
