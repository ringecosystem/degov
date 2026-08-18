import {
  CREATE_PROPOSAL_COMMENT,
  DELETE_PROPOSAL_COMMENT,
  UPDATE_PROPOSAL_COMMENT,
} from "./graphql/mutations/proposal-comments";
import { PROPOSAL_COMMENTS } from "./graphql/queries/proposal-comments";
import { requestRemote } from "./graphql/remote-client";

import type {
  CreateProposalCommentInput,
  DeleteProposalCommentInput,
  ProposalComment,
  ProposalCommentPage,
  ProposalCommentsInput,
  UpdateProposalCommentInput,
} from "./graphql/types/proposal-comments";

export const proposalCommentsService = {
  async list(input: ProposalCommentsInput): Promise<ProposalCommentPage> {
    const response = await requestRemote<{
      proposalComments: ProposalCommentPage;
    }, { input: ProposalCommentsInput }>(PROPOSAL_COMMENTS, { input });
    return response.proposalComments;
  },

  async create(
    input: CreateProposalCommentInput,
    address: string
  ): Promise<ProposalComment> {
    const response = await requestRemote<{
      createProposalComment: ProposalComment;
    }, { input: CreateProposalCommentInput }>(
      CREATE_PROPOSAL_COMMENT,
      { input },
      address
    );
    return response.createProposalComment;
  },

  async update(
    input: UpdateProposalCommentInput,
    address: string
  ): Promise<ProposalComment> {
    const response = await requestRemote<{
      updateProposalComment: ProposalComment;
    }, { input: UpdateProposalCommentInput }>(
      UPDATE_PROPOSAL_COMMENT,
      { input },
      address
    );
    return response.updateProposalComment;
  },

  async delete(
    input: DeleteProposalCommentInput,
    address: string
  ): Promise<ProposalComment> {
    const response = await requestRemote<{
      deleteProposalComment: ProposalComment;
    }, { input: DeleteProposalCommentInput }>(
      DELETE_PROPOSAL_COMMENT,
      { input },
      address
    );
    return response.deleteProposalComment;
  },
};
