import { clearToken, getToken } from "@/hooks/useSign";

import { request } from "./client";
import * as Queries from "./queries";
import * as Types from "./types";


import type { ProfileData } from "./types/profile";
import type { EvmAbiResponse, EvmAbiInput, } from "./types/proposals";

export const proposalService = {
  getAllProposals: async (
    endpoint: string,
    options: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      where?: {
        proposalId_eq?: string;
        proposer_eq?: string;
        voters_every?: {
          voter_eq?: string;
          support_eq?: number;
        };
      };
    } = {}
  ) => {
    const response = await request<Types.ProposalResponse>(
      endpoint,
      Queries.GET_ALL_PROPOSALS,
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
      where?: {
        description_containsInsensitive?: string;
      };
    } = {}
  ) => {
    const response = await request<Types.ProposalResponse>(
      endpoint,
      Queries.GET_PROPOSALS_BY_DESCRIPTION,
      options
    );
    return response?.proposals ?? [];
  },
  getProposalMetrics: async (endpoint: string) => {
    const response = await request<Types.ProposalMetricsResponse>(
      endpoint,
      Queries.GET_PROPOSAL_METRICS
    );
    return response?.dataMetrics?.[0];
  },

  getProposalCanceledById: async (endpoint: string, id: string) => {
    const response = await request<Types.ProposalCanceledByIdResponse>(
      endpoint,
      Queries.GET_PROPOSAL_CANCELED_BY_ID,
      {
        where: {
          proposalId_eq: id,
        },
      }
    );
    return response?.proposalCanceleds?.[0];
  },
  getProposalExecutedById: async (endpoint: string, id: string) => {
    const response = await request<Types.ProposalExecutedByIdResponse>(
      endpoint,
      Queries.GET_PROPOSAL_EXECUTED_BY_ID,
      {
        where: {
          proposalId_eq: id,
        },
      }
    );
    return response?.proposalExecuteds?.[0];
  },
  getProposalQueuedById: async (endpoint: string, id: string) => {
    const response = await request<Types.ProposalQueuedByIdResponse>(
      endpoint,
      Queries.GET_PROPOSAL_QUEUED_BY_ID,
      {
        where: {
          proposalId_eq: id,
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
      where?: {
        power_gt?: number;
        toDelegate_eq?: string;
      };
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
      where: {
        from_eq: string;
      };
    } = {
      where: {
        from_eq: "",
      },
    }
  ) => {
    const response = await request<Types.DelegateMappingResponse>(
      endpoint,
      Queries.GET_DELEGATE_MAPPINGS,
      options
    );
    return response?.delegateMappings ?? [];
  },
  getDelegateMappingsConnection: async (
    endpoint: string,
    options: {
      where: {
        to_eq: string;
      };
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



export const contributorService = {
  getAllContributors: async (
    endpoint: string,
    options: {
      limit: number;
      offset: number;
      where?: {
        id_in?: string[];
        id_not_eq?: string;
        id_eq?: string;
      };
    } = {
      limit: 10,
      offset: 0,
      where: {
        id_in: [],
        id_not_eq: undefined,
      },
    }
  ) => {
    const response = await request<Types.ContributorResponse>(
      endpoint,
      Queries.GET_CONTRIBUTORS,
      {
        limit: options?.limit,
        offset: options?.offset,
        orderBy: "power_DESC",
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
        Authorization: `Bearer ${getToken()}`,
      },
    });
    const data = await response.json();
    return data;
  },

  updateProfile: async (address: string, profile: Partial<ProfileData>) => {
    const response = await fetch(`/api/profile/${address}`, {
      method: "POST",
      body: JSON.stringify(profile),
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
    });
    if (response.status === 401) {
      clearToken();
      return {
        code: 401,
        msg: "Unauthorized",
      };
    }
    const data = await response.json();
    return data;
  },
};

export const memberService = {
  getMembers: async (
    checkpoint?: number,
    limit?: number
  ): Promise<Types.MemberResponse> => {
    try {
      const url = new URL("/api/degov/members", window.location.origin);

      if (checkpoint) {
        url.searchParams.set("checkpoint", checkpoint.toString());
      }

      if (limit) {
        url.searchParams.set("limit", limit.toString());
      }

      const response = await fetch(url.toString(), {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
      });

      if (response.status === 401) {
        clearToken();
        return {
          code: 401,
          data: [],
          message: "Unauthorized",
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error fetching members:", error);
      return {
        code: 500,
        data: [],
        message: (error as Error)?.message || "Failed to fetch members",
      };
    }
  },

  // ### [degov] Profile pull
  // POST https://degov-dev.vercel.app/api/profile/pull
  // Content-Type: application/json

  // [
  //   "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
  //   "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9"
  // ]

  getMemberTotal: async (): Promise<Types.MemberTotalResponse> => {
    const response = await fetch(`/api/degov/metrics`, {
      next: { revalidate: 60, tags: ["member-metrics"] },
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
    });
    const data = await response.json();
    return data;
  },

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
