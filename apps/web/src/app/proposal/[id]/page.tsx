import { notFound } from "next/navigation";

import { buildProposalWebPageJsonLd } from "@/lib/structured-data";

import { ProposalDetailPublicSummary } from "../../_components/public-route-summary";
import { getActiveDaoConfig, getPublicProposalDetail } from "../../_server/public-seo";

import { ProposalDetailClient } from "./proposal-detail-client";
import { ProposalReadAnalytics } from "./proposal-read-analytics";

type ProposalPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProposalPage({ params }: ProposalPageProps) {
  const { id } = await params;
  const config = await getActiveDaoConfig();
  const { proposal, invalidId, failed } = await getPublicProposalDetail(config, id);

  if (invalidId) {
    notFound();
  }

  const proposalJsonLd = buildProposalWebPageJsonLd(config, proposal);

  return (
    <div className="flex flex-col gap-[20px]">
      {proposalJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: proposalJsonLd }}
        />
      ) : null}
      <ProposalDetailPublicSummary
        config={config}
        proposal={proposal}
        failed={failed}
      />
      {proposal ? (
        <ProposalReadAnalytics
          daoCode={config.code}
          proposalId={proposal.proposalId}
        />
      ) : null}
      <ProposalDetailClient />
    </div>
  );
}
