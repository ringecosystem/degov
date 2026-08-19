import { notFound } from "next/navigation";

import { buildProposalWebPageJsonLd } from "@/lib/structured-data";

import { proposalDetailPublicSummaryHtml } from "../../_components/public-route-summary";
import { getActiveDaoConfig, getPublicProposalDetail } from "../../_server/public-seo";

import { ProposalDetailClient } from "./proposal-detail-client";

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
  const proposalSummaryHtml = proposalDetailPublicSummaryHtml({ config, proposal, failed });

  return (
    <div className="flex flex-col gap-[20px]">
      {proposalJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: proposalJsonLd }}
        />
      ) : null}
      <noscript dangerouslySetInnerHTML={{ __html: proposalSummaryHtml }} />
      <ProposalDetailClient />
    </div>
  );
}
