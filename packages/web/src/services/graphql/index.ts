import type { Config } from "@/types/config";

import { request } from "./client";
import * as Queries from "./queries";
import * as Types from "./types";

export const proposalService = {
  getProposalCreatedById: async (config: Config | null, id: string) => {
    const response = await request<Types.ProposalCreatedByIdResponse>(
      config,
      Queries.GET_PROPOSAL_CREATED_BY_ID,
      { id }
    );
    return response.proposalCreatedById;
  },
};

export { Types };

export { Queries };
