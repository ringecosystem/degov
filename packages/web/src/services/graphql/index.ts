import { request } from "./client";
import * as Queries from "./queries";
import * as Types from "./types";

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

  getProposalCanceledById: async (endpoint: string, id: string) => {
    const response = await request<Types.ProposalCanceledByIdResponse>(
      endpoint,
      Queries.GET_PROPOSAL_CANCELED_BY_ID,
      { id }
    );
    return response?.proposalCanceledById;
  },
  getProposalExecutedById: async (endpoint: string, id: string) => {
    const response = await request<Types.ProposalExecutedByIdResponse>(
      endpoint,
      Queries.GET_PROPOSAL_EXECUTED_BY_ID,
      { id }
    );
    return response?.proposalExecutedById;
  },
  getProposalQueuedById: async (endpoint: string, id: string) => {
    const response = await request<Types.ProposalQueuedByIdResponse>(
      endpoint,
      Queries.GET_PROPOSAL_QUEUED_BY_ID,
      { id }
    );
    return response?.proposalQueuedById;
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

export const profileService = {
  getProfile: async (address: string) => {
    const response = await fetch(`/api/profile/${address}`, {
      cache: "no-store",
    });
    const data = await response.json();
    return data;
  },

  updateProfile: async (
    address: string,
    profile: {
      name?: string;
      avatar?: string;
      email?: string;
      twitter?: string;
      github?: string;
      discord?: string;
      additional?: string;
    }
  ) => {
    const response = await fetch(`/api/profile/${address}`, {
      method: "POST",
      body: JSON.stringify(profile),
      cache: "no-store",
    });
    const data = await response.json();
    return data;
  },
};

export { Types };

export { Queries };
