import { getConfigCachedByHost } from "@/app/_server/config-remote";
import { getDaoConfigServer } from "@/lib/config";
import {
  buildNoPublicPreviewMetadata,
  buildProposalMetadata,
} from "@/lib/metadata";
import { buildGovernanceScope, proposalService } from "@/services/graphql";
import { extractTitleAndDescription, parseDescription } from "@/utils/helpers";
import { findHiddenProposal } from "@/utils/proposal-visibility";
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

  if (findHiddenProposal(config, id)) {
    return buildNoPublicPreviewMetadata("Proposal unavailable");
  }

  try {
    BigInt(id);
  } catch {
    return buildNoPublicPreviewMetadata("Proposal not found");
  }

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
      return buildNoPublicPreviewMetadata("Proposal not found");
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
