import { buildHomeMetadata } from "@/lib/metadata";

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

  return (
    <div className="flex flex-col gap-[20px] lg:gap-[30px]">
      <DaoPublicSummary config={config} />
      <HomeClient />
    </div>
  );
}
