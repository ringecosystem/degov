import { clearToken } from "@/lib/auth/token-manager";
import { getToken } from "@/lib/auth/token-manager";
import type { Config } from "@/types/config";
import { degovGraphqlApi } from "@/utils/remote-api";

import { request } from "./client";
import * as Mutations from "./mutations";
import * as Queries from "./queries";
import * as Types from "./types";
import { resolveGovernanceCounts } from "./types/counts";

import type { ProfileData } from "./types/profile";
import type { EvmAbiResponse, EvmAbiInput } from "./types/proposals";

const emptyProposalMetrics: Types.ProposalMetricsItem = {
  memberCount: 0,
  powerSum: "0",
  proposalsCount: "0",
  votesCount: "0",
  votesWeightAbstainSum: "0",
  votesWeightAgainstSum: "0",
  votesWeightForSum: "0",
  votesWithParamsCount: "0",
  votesWithoutParamsCount: "0",
};

export type GovernanceScope = {
  chainId_eq?: number;
  governorAddress_eq?: string;
  daoCode_eq?: string;
};

type ProposalVoterFilter = {
  voter_eq?: string;
  support_eq?: number;
};

export type ProposalWhere = GovernanceScope & {
  proposalId_eq?: string;
  proposer_eq?: string;
  description_containsInsensitive?: string;
  voters_every?: ProposalVoterFilter;
  voters_some?: ProposalVoterFilter;
  OR?: {
    voters_some?: ProposalVoterFilter;
  };
};

type ProposalMetricsWhere = GovernanceScope & {
  id_eq?: string;
};

type DelegateWhere = GovernanceScope & {
  toDelegate_eq?: string;
};

type DelegateMappingWhere = GovernanceScope & {
  from_eq?: string;
  to_eq?: string;
};

type ContributorWhere = GovernanceScope & {
  id_in?: string[];
  id_not_eq?: string;
  id_eq?: string;
};

const normalizeScopeAddress = (address?: string | null) => {
  return address ? address.toLowerCase() : undefined;
};

export const buildGovernanceScope = (
  daoConfig?: Config | null
): GovernanceScope => {
  if (!daoConfig) {
    return {};
  }

  return {
    chainId_eq: daoConfig.chain?.id,
    governorAddress_eq: normalizeScopeAddress(
      daoConfig.contracts?.governor
    ),
    daoCode_eq: daoConfig.code,
  };
};

export const proposalService = {
  getAllProposals: async (
    endpoint: string,
    options: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      where?: ProposalWhere;
    } = {}
  ) => {
    const response = await request<Types.ProposalResponse>(
      endpoint,
      Queries.GET_ALL_PROPOSALS,
      options
    );
    return response?.proposals ?? [];
  },
  getProposalsList: async (
    endpoint: string,
    options: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      where?: ProposalWhere;
      voter?: string;
    } = {}
  ) => {
    const response = await request<Types.ProposalListResponse>(
      endpoint,
      Queries.GET_PROPOSALS_LIST,
      options
    );
    return response?.proposals ?? [];
  },
  getProposalsByDescription: async (
    endpoint: string,
    options: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      where?: ProposalWhere;
    } = {}
  ) => {
    const response = await request<Types.ProposalDescriptionResponse>(
      endpoint,
      Queries.GET_PROPOSALS_BY_DESCRIPTION,
      options
    );
    return response?.proposals ?? [];
  },
  getProposalMetrics: async (endpoint: string, scope?: GovernanceScope) => {
    const response = await request<Types.ProposalMetricsResponse>(
      endpoint,
      Queries.GET_PROPOSAL_METRICS,
      {
        where: {
          id_eq: "global",
          ...scope,
        } satisfies ProposalMetricsWhere,
      }
    );
    return response?.dataMetrics?.[0] ?? emptyProposalMetrics;
  },
  getGovernanceCounts: async (endpoint: string) => {
    const response = await request<Types.GovernanceCountsResponse>(
      endpoint,
      Queries.GET_GOVERNANCE_COUNTS
    );
    return resolveGovernanceCounts(response);
  },

  getProposalVoteRate: async (
    endpoint: string,
    voter: string,
    limit = 10,
    scope?: GovernanceScope
  ) => {
    if (!voter) {
      return [] as Types.ProposalVoteRateResponse["proposals"];
    }
    const response = await request<Types.ProposalVoteRateResponse>(
      endpoint,
      Queries.GET_PROPOSAL_VOTE_RATE,
      {
        limit,
        voter: voter.toLowerCase(),
        where: scope,
      }
    );
    return response?.proposals ?? [];
  },
  getSummaryProposalStates: async (daoCode: string) => {
    if (!daoCode) {
      return [] as Types.SummaryProposalStateItem[];
    }

    const endpoint = degovGraphqlApi();
    if (!endpoint) {
      return [] as Types.SummaryProposalStateItem[];
    }

    try {
      const response = await request<Types.SummaryProposalStatesResponse>(
        endpoint,
        Queries.GET_SUMMARY_PROPOSAL_STATES,
        {
          daoCode,
        }
      );
      return response?.summaryProposalStates ?? [];
    } catch (error) {
      console.error("Failed to load summary proposal states:", error);
      return [];
    }
  },

  getBotAddress: async () => {
    const endpoint = degovGraphqlApi();
    if (!endpoint) {
      return undefined;
    }

    try {
      const response = await request<{ botAddress: string }>(
        endpoint,
        Queries.GET_BOT_ADDRESS
      );
      return response?.botAddress;
    } catch (error) {
      console.error("Failed to get bot address:", error);
      return undefined;
    }
  },

  getProposalSummary: async (options: {
    proposalId: string;
    daoCode: string;
  }) => {
    const endpoint = degovGraphqlApi();
    if (!endpoint) {
      return undefined;
    }

    try {
      const response = await request<{ proposalSummary: string }>(
        endpoint,
        Queries.GET_PROPOSAL_SUMMARY,
        options
      );
      return response?.proposalSummary;
    } catch (error) {
      console.error("Failed to get proposal summary:", error);
      return undefined;
    }
  },

  getProposalCanceledById: async (
    endpoint: string,
    id: string,
    scope?: GovernanceScope
  ) => {
    const response = await request<Types.ProposalCanceledByIdResponse>(
      endpoint,
      Queries.GET_PROPOSAL_CANCELED_BY_ID,
      {
        where: {
          proposalId_eq: id,
          ...scope,
        },
      }
    );
    return response?.proposalCanceleds?.[0];
  },
  getProposalExecutedById: async (
    endpoint: string,
    id: string,
    scope?: GovernanceScope
  ) => {
    const response = await request<Types.ProposalExecutedByIdResponse>(
      endpoint,
      Queries.GET_PROPOSAL_EXECUTED_BY_ID,
      {
        where: {
          proposalId_eq: id,
          ...scope,
        },
      }
    );
    return response?.proposalExecuteds?.[0];
  },
  getProposalQueuedById: async (
    endpoint: string,
    id: string,
    scope?: GovernanceScope
  ) => {
    const response = await request<Types.ProposalQueuedByIdResponse>(
      endpoint,
      Queries.GET_PROPOSAL_QUEUED_BY_ID,
      {
        where: {
          proposalId_eq: id,
          ...scope,
        },
      }
    );
    return response?.proposalQueueds?.[0];
  },
  getEvmAbi: async (endpoint: string, input: EvmAbiInput) => {
    const response = await request<EvmAbiResponse>(
      endpoint,
      Queries.GET_EVM_ABI,
      {
        chain: input.chain,
        contract: input.contract,
      }
    );
    return response?.evmAbi;
  },
};

export const delegateService = {
  getAllDelegates: async (
    endpoint: string,
    options: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      where?: DelegateWhere;
    } = {}
  ) => {
    const response = await request<Types.DelegateResponse>(
      endpoint,
      Queries.GET_DELEGATES,
      options
    );
    return response?.delegates ?? [];
  },
  getDelegateMappings: async (
    endpoint: string,
    options: {
      limit?: number;
      offset?: number;
      orderBy?: string | string[];
      where: DelegateMappingWhere;
    } = {
      where: {
        from_eq: "",
      },
    }
  ) => {
    const response = await request<Types.DelegateMappingResponse>(
      endpoint,
      Queries.GET_DELEGATE_MAPPINGS,
      {
        limit: options?.limit,
        offset: options?.offset,
        orderBy: Array.isArray(options?.orderBy)
          ? options.orderBy
          : options?.orderBy
            ? [options.orderBy]
            : undefined,
        where: options?.where,
      }
    );
    return response?.delegateMappings ?? [];
  },
  getDelegateMappingsConnection: async (
    endpoint: string,
    options: {
      where: DelegateMappingWhere;
      orderBy: string[];
    }
  ) => {
    const response = await request<Types.DelegateMappingConnectionResponse>(
      endpoint,
      Queries.GET_DELEGATE_MAPPINGS_CONNECTION,
      options
    );
    return response?.delegateMappingsConnection;
  },
};

export const squidStatusService = {
  getSquidStatus: async (endpoint: string) => {
    const response = await request<Types.SquidStatusResponse>(
      endpoint,
      Queries.GET_SQUID_STATUS
    );
    return response?.squidStatus;
  },
};

export const treasuryService = {
  getTreasuryAssets: async (
    endpoint: string,
    input: Types.TreasuryAssetsRequestVariables
  ) => {
    const response = await request<
      Types.TreasuryAssetsResponse,
      Types.TreasuryAssetsRequestVariables
    >(endpoint, Queries.GET_TREASURY_ASSETS, {
      chain: input.chain,
      address: input.address,
    });

    return response?.treasuryAssets ?? [];
  },
};

export const contributorService = {
  getAllContributors: async (
    endpoint: string,
    options: {
      limit: number;
      offset: number;
      orderBy?: string | string[];
      where?: ContributorWhere;
    } = {
      limit: 10,
      offset: 0,
      orderBy: "lastVoteTimestamp_DESC_NULLS_LAST",
      where: {
        id_in: [],
        id_not_eq: undefined,
      },
    }
  ) => {
    const orderByInput = Array.isArray(options?.orderBy)
      ? options?.orderBy
      : options?.orderBy
      ? [options.orderBy]
      : ["lastVoteTimestamp_DESC_NULLS_LAST"];

    const response = await request<Types.ContributorResponse>(
      endpoint,
      Queries.GET_CONTRIBUTORS,
      {
        limit: options?.limit,
        offset: options?.offset,
        orderBy: orderByInput,
        where: options?.where,
      }
    );
    return response?.contributors ?? [];
  },
};

export const profileService = {
  getProfile: async (
    address: string
  ): Promise<{
    code: number;
    data: ProfileData;
  }> => {
    const response = await fetch(`/api/profile/${address}`, {
      next: { revalidate: 300, tags: [`profile-${address}`] },
      headers: {
        "Content-Type": "application/json",
      },
    });
    const data = await response.json();
    return data;
  },

  updateProfile: async (address: string, profile: Partial<ProfileData>) => {
    const token = getToken(address);
    const response = await fetch(`/api/profile/${address}`, {
      method: "POST",
      body: JSON.stringify(profile),
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (response.status === 401) {
      clearToken(address);
      return { code: 401, msg: "Unauthorized" } as const;
    }
    const data = await response.json();
    return data;
  },
};

export const memberService = {
  // ### [degov] Profile pull
  // POST https://degov-dev.vercel.app/api/profile/pull
  // Content-Type: application/json

  // [
  //   "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
  //   "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9"
  // ]

  // ### [degov] Profile pull
  getProfilePull: async (
    addresses: string[]
  ): Promise<Types.ProfilePullResponse> => {
    const response = await fetch(`/api/profile/pull`, {
      method: "POST",
      body: JSON.stringify(addresses),
    });
    const data = await response.json();
    return data;
  },
};
export { Types };

export { Queries };

export { Mutations };
