import { HomeClient } from "./_components/home-client";
import { DaoPublicSummary } from "./_components/public-route-summary";
import { getActiveDaoConfig } from "./_server/public-seo";

export default async function HomePage() {
  const config = await getActiveDaoConfig();

  return (
    <div className="flex flex-col gap-[20px] lg:gap-[30px]">
      <DaoPublicSummary config={config} />
      <HomeClient />
    </div>
  );
}
