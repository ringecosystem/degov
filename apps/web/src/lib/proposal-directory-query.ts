import { DEFAULT_PAGE_SIZE, INITIAL_LIST_PAGE_SIZE } from "@/config/base";
import {
  buildGovernanceScope,
  proposalService,
  type ProposalWhere,
} from "@/services/graphql";
import type { ProposalListItem } from "@/services/graphql/types";
import type { Config } from "@/types/config";
import { filterHiddenProposals } from "@/utils/proposal-visibility";

export {
  buildProposalInfiniteInitialData,
  buildProposalListQueryKey,
  getProposalNextPageParam,
  normalizeProposalInitialPageSize,
  shouldUseProposalInitialPage,
  type ProposalPageParam,
} from "./proposal-directory-query-contract";

export type SupportFilter = "0" | "1" | "2";

export type InitialProposalPage = {
  proposals: ProposalListItem[];
  failed: boolean;
  pageSize: number;
  updatedAt: number;
};

export const PROPOSAL_LIST_ORDER_BY = "blockTimestamp_DESC_NULLS_LAST";
export const PROPOSAL_DIRECTORY_PAGE_SIZE = DEFAULT_PAGE_SIZE;
export const PROPOSAL_DIRECTORY_INITIAL_PAGE_SIZE = INITIAL_LIST_PAGE_SIZE;

export function buildProposalListWhere({
  config,
  address,
  support,
}: {
  config?: Config | null;
  address?: string;
  support?: SupportFilter;
}): ProposalWhere {
  if (address && !support) {
    return {
      ...buildGovernanceScope(config),
      proposer_eq: address.toLowerCase(),
      OR: {
        voters_some: {
          voter_eq: address.toLowerCase(),
        },
      },
    };
  }

  if (address && support) {
    return {
      ...buildGovernanceScope(config),
      voters_some: {
        voter_eq: address.toLowerCase(),
        support_eq: parseInt(support),
      },
    };
  }

  return {
    ...buildGovernanceScope(config),
  };
}

export async function fetchProposalListPage({
  config,
  offset = 0,
  limit,
  address,
  support,
  connectedAddress,
}: {
  config: Config;
  offset?: number;
  limit: number;
  address?: string;
  support?: SupportFilter;
  connectedAddress?: string;
}) {
  const hiddenCount = config.hiddenProposals?.length ?? 0;
  const fetchFromStart = hiddenCount > 0;
  const proposals = await proposalService.getProposalsList(
    config.indexer?.endpoint as string,
    {
      // ponytail: refetch from zero while GraphQL lacks proposalId_not_in;
      // add that filter if large proposal directories make this measurable.
      limit: fetchFromStart ? offset + limit + hiddenCount : limit,
      offset: fetchFromStart ? 0 : offset,
      orderBy: PROPOSAL_LIST_ORDER_BY,
      where: buildProposalListWhere({ config, address, support }),
      voter: connectedAddress?.toLowerCase(),
    }
  );

  return filterHiddenProposals(config, proposals).slice(
    fetchFromStart ? offset : 0,
    fetchFromStart ? offset + limit : limit
  );
}
