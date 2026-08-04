import { getConfigCachedByHost } from "@/app/_server/config-remote";
import { getDaoConfigServer } from "@/lib/config";
import {
  buildGovernanceScope,
  proposalService,
  type GovernanceScope,
} from "@/services/graphql";
import type { ProposalItem, ProposalListItem } from "@/services/graphql/types";
import type { Config } from "@/types/config";
import { extractTitleAndDescription, parseDescription } from "@/utils/helpers";
import { isDegovApiConfiguredServer } from "@/utils/remote-api";

const PROPOSAL_LIST_LIMIT = 12;
const SITEMAP_PROPOSAL_LIMIT = 500;

export async function getActiveDaoConfig(): Promise<Config> {
  if (isDegovApiConfiguredServer()) {
    return getConfigCachedByHost();
  }

  return getDaoConfigServer();
}

export function getCanonicalSiteUrl(config: Config | null | undefined): string | null {
  const value = config?.siteUrl?.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.hostname === "localhost") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function canonicalUrl(config: Config | null | undefined, path = "/"): string | null {
  const origin = getCanonicalSiteUrl(config);
  if (!origin) return null;

  return new URL(path, origin).toString();
}

export function publicGovernanceScope(config: Config | null | undefined): GovernanceScope {
  return buildGovernanceScope(config);
}

export async function getPublicProposalList(config: Config): Promise<{
  proposals: ProposalListItem[];
  failed: boolean;
}> {
  if (!config.indexer?.endpoint) {
    return { proposals: [], failed: false };
  }

  try {
    const proposals = await proposalService.getProposalsList(config.indexer.endpoint, {
      limit: PROPOSAL_LIST_LIMIT,
      orderBy: "blockTimestamp_DESC_NULLS_LAST",
      where: publicGovernanceScope(config),
    });

    return { proposals, failed: false };
  } catch (error) {
    console.error("Failed to load public proposal list:", error);
    return { proposals: [], failed: true };
  }
}

export async function getPublicProposalDetail(
  config: Config,
  proposalId: string
): Promise<{
  proposal?: ProposalItem;
  invalidId: boolean;
  failed: boolean;
}> {
  try {
    BigInt(proposalId);
  } catch {
    return { invalidId: true, failed: false };
  }

  if (!config.indexer?.endpoint) {
    return { invalidId: false, failed: true };
  }

  try {
    const proposals = await proposalService.getAllProposals(config.indexer.endpoint, {
      where: {
        ...publicGovernanceScope(config),
        proposalId_eq: proposalId,
      },
    });

    return { proposal: proposals[0], invalidId: false, failed: false };
  } catch (error) {
    console.error("Failed to load public proposal detail:", error);
    return { invalidId: false, failed: true };
  }
}

export async function getSitemapProposalIds(config: Config): Promise<string[]> {
  if (!config.indexer?.endpoint) return [];

  try {
    const proposals = await proposalService.getProposalsList(config.indexer.endpoint, {
      limit: SITEMAP_PROPOSAL_LIMIT,
      orderBy: "blockTimestamp_DESC_NULLS_LAST",
      where: publicGovernanceScope(config),
    });

    return proposals.map((proposal) => proposal.proposalId).filter(Boolean);
  } catch (error) {
    console.error("Failed to load sitemap proposal URLs:", error);
    return [];
  }
}

export function proposalTitleAndSummary(proposal: ProposalItem): {
  title: string;
  summary: string;
} {
  const parsed = parseDescription(proposal.description);
  const extracted = extractTitleAndDescription(parsed.mainText);

  return {
    title: proposal.title || extracted.title || `Proposal ${proposal.proposalId}`,
    summary: extracted.description || parsed.mainText,
  };
}
