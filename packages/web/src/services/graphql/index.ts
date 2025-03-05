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
    } = {}
  ) => {
    const response = await request<Types.ProposalResponse>(
      endpoint,
      Queries.GET_ALL_PROPOSALS,
      options
    );
    return response?.proposalCreateds ?? [];
  },
  getProposalById: async (endpoint: string, id: string) => {
    const response = await request<Types.ProposalByIdResponse>(
      endpoint,
      Queries.GET_PROPOSAL_BY_ID,
      { id }
    );
    return response?.proposalCreatedById;
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

export { Types };

export { Queries };
