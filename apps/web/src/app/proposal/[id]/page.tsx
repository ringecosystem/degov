import { notFound } from "next/navigation";

import { ProposalDetailPublicSummary } from "../../_components/public-route-summary";
import { getActiveDaoConfig, getPublicProposalDetail } from "../../_server/public-seo";

import { ProposalDetailClient } from "./proposal-detail-client";

type ProposalPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProposalPage({ params }: ProposalPageProps) {
  const { id } = await params;
  const config = await getActiveDaoConfig();
  const { proposal, invalidId, failed } = await getPublicProposalDetail(config, id);

  if (invalidId || (!failed && !proposal)) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-[20px]">
      <ProposalDetailPublicSummary
        config={config}
        proposal={proposal}
        failed={failed}
      />
      <ProposalDetailClient />
    </div>
  );
}
