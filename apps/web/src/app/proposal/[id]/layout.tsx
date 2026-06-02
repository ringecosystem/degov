import { getConfigCachedByHost } from "@/app/_server/config-remote";
import { getDaoConfigServer } from "@/lib/config";
import { buildProposalMetadata } from "@/lib/metadata";
import { buildGovernanceScope, proposalService } from "@/services/graphql";
import { extractTitleAndDescription, parseDescription } from "@/utils/helpers";
import { isDegovApiConfiguredServer } from "@/utils/remote-api";

import type { Metadata } from "next";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

async function getDaoConfig() {
  if (isDegovApiConfiguredServer()) {
    return getConfigCachedByHost();
  }

  return getDaoConfigServer();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const config = await getDaoConfig();

  if (!config?.indexer?.endpoint) {
    return buildProposalMetadata({
      config,
      proposalId: id,
    });
  }

  try {
    const proposals = await proposalService.getAllProposals(
      config.indexer.endpoint,
      {
        where: {
          ...buildGovernanceScope(config),
          proposalId_eq: id,
        },
      }
    );
    const proposal = proposals[0];

    if (!proposal) {
      return buildProposalMetadata({
        config,
        proposalId: id,
      });
    }

    const parsedDescription = parseDescription(proposal.description);
    const titleAndDescription = extractTitleAndDescription(
      parsedDescription.mainText
    );

    return buildProposalMetadata({
      config,
      proposalId: proposal.proposalId,
      title: proposal.title || titleAndDescription.title,
      description:
        titleAndDescription.description || parsedDescription.mainText,
    });
  } catch (error) {
    console.error("Failed to build proposal metadata:", error);

    return buildProposalMetadata({
      config,
      proposalId: id,
    });
  }
}

export default function ProposalMetadataLayout({ children }: LayoutProps) {
  return children;
}
