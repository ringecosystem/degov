import {
  DELETE_PROPOSAL_DRAFT,
  SAVE_PROPOSAL_DRAFT,
} from "./graphql/mutations/proposal-drafts";
import {
  MY_PROPOSAL_DRAFTS,
  PROPOSAL_DRAFT,
} from "./graphql/queries/proposal-drafts";
import { requestRemote } from "./graphql/remote-client";

import type {
  DeleteProposalDraftInput,
  ProposalDraft,
  ProposalDraftInput,
  ProposalDraftPage,
  ProposalDraftsInput,
  SaveProposalDraftInput,
} from "./graphql/types/proposal-drafts";

export const proposalDraftsService = {
  async list(
    input: ProposalDraftsInput,
    address: string
  ): Promise<ProposalDraftPage> {
    const response = await requestRemote<{
      myProposalDrafts: ProposalDraftPage;
    }, { input: ProposalDraftsInput }>(MY_PROPOSAL_DRAFTS, { input }, address);
    return response.myProposalDrafts;
  },

  async get(
    input: ProposalDraftInput,
    address: string
  ): Promise<ProposalDraft> {
    const response = await requestRemote<{
      proposalDraft: ProposalDraft;
    }, { input: ProposalDraftInput }>(PROPOSAL_DRAFT, { input }, address);
    return response.proposalDraft;
  },

  async save(
    input: SaveProposalDraftInput,
    address: string
  ): Promise<ProposalDraft> {
    const response = await requestRemote<{
      saveProposalDraft: ProposalDraft;
    }, { input: SaveProposalDraftInput }>(
      SAVE_PROPOSAL_DRAFT,
      { input },
      address
    );
    return response.saveProposalDraft;
  },

  async delete(
    input: DeleteProposalDraftInput,
    address: string
  ): Promise<boolean> {
    const response = await requestRemote<{
      deleteProposalDraft: boolean;
    }, { input: DeleteProposalDraftInput }>(
      DELETE_PROPOSAL_DRAFT,
      { input },
      address
    );
    return response.deleteProposalDraft;
  },
};
