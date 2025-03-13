import { clearToken, getToken } from "@/hooks/useSign";

import { request } from "./client";
import * as Queries from "./queries";
import * as Types from "./types";

import type { ProfileData } from "./types/profile";

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

  getProposalTotal: async (endpoint: string) => {
    const results: string[] = [];
    const batchSize = 100;
    let offset = 0;
    let success = false;
    while (!success) {
      const response = await request<Types.ProposalTotalResponse>(
        endpoint,
        Queries.GET_ALL_PROPOSALS_TOTAL,
        {
          limit: batchSize,
          offset: offset,
        }
      );
      const batch = response?.proposals ?? [];

      if (batch.length === 0) {
        success = true;
        break;
      }
      results.push(...batch);
      if (batch.length < batchSize) {
        success = true;
        break;
      }
      offset += batchSize;
    }
    return results?.length ?? 0;
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
};

export const delegateService = {
  getAllDelegates: async (
    endpoint: string,
    options: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      where?: {
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

export const profileService = {
  getProfile: async (
    address: string
  ): Promise<{
    code: number;
    data: ProfileData;
  }> => {
    const response = await fetch(`/api/profile/${address}`, {
      cache: "no-store",
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
  getAllMembers: async (): Promise<Types.MemberResponse> => {
    try {
      const response = await fetch(`/api/degov/members`, {
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
      });

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
};
export { Types };

export { Queries };
