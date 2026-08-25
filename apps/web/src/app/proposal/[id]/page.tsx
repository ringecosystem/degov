import { notFound } from "next/navigation";

import { buildProposalWebPageJsonLd } from "@/lib/structured-data";
import { findHiddenProposal } from "@/utils/proposal-visibility";

import { proposalDetailPublicSummaryHtml } from "../../_components/public-route-summary";
import { getActiveDaoConfig, getPublicProposalDetail } from "../../_server/public-seo";

import { HiddenProposalNotice } from "./hidden-proposal";
import { ProposalDetailClient } from "./proposal-detail-client";

type ProposalPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProposalPage({ params }: ProposalPageProps) {
  const { id } = await params;
  const config = await getActiveDaoConfig();
  const hiddenProposal = findHiddenProposal(config, id);

  if (hiddenProposal) {
    return <HiddenProposalNotice config={config} proposal={hiddenProposal} />;
  }

  const { proposal, invalidId, failed } = await getPublicProposalDetail(config, id);

  if (invalidId) {
    notFound();
  }

  const proposalJsonLd = buildProposalWebPageJsonLd(config, proposal);
  const proposalSummaryHtml = proposalDetailPublicSummaryHtml({ config, proposal, failed });

  return (
    <div className="flex flex-col gap-[20px]">
      {proposalJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: proposalJsonLd }}
        />
      ) : null}
      <div
        hidden
        data-crawler-summary=""
        dangerouslySetInnerHTML={{ __html: proposalSummaryHtml }}
      />
      <ProposalDetailClient />
    </div>
  );
}
