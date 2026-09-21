import { discussionTargetInputs } from "./discussion-target";
import {
  CREATE_PROPOSAL_COMMENT,
  DELETE_PROPOSAL_COMMENT,
  UPDATE_PROPOSAL_COMMENT,
} from "./graphql/mutations/proposal-comments";
import {
  DISCUSSION_COMMENTS,
  DISCUSSION_TARGET,
} from "./graphql/queries/proposal-comments";
import { requestRemote } from "./graphql/remote-client";

import type {
  CreateProposalCommentInput,
  DeleteProposalCommentInput,
  DiscussionTarget,
  ProposalComment,
  ProposalCommentPage,
  ProposalCommentsInput,
  UpdateProposalCommentInput,
} from "./graphql/types/proposal-comments";

async function resolveTarget(daoCode: string, proposalId: string) {
  for (const input of discussionTargetInputs(daoCode, proposalId)) {
    const response = await requestRemote<{
      discussionTarget: DiscussionTarget | null;
    }, { input: { space: string; path: string } }>(DISCUSSION_TARGET, {
      input,
    });
    if (response.discussionTarget) {
      return response.discussionTarget;
    }
  }
  throw new Error("Discussion target is not registered");
}

export const proposalCommentsService = {
  async list(input: ProposalCommentsInput): Promise<ProposalCommentPage> {
    const target = await resolveTarget(input.daoCode, input.proposalId);
    const response = await requestRemote<{
      discussionComments: ProposalCommentPage;
    }, { input: { targetId: string; first?: number; after?: string } }>(
      DISCUSSION_COMMENTS,
      {
        input: {
          targetId: target.id,
          first: input.first,
          after: input.after,
        },
      }
    );
    return response.discussionComments;
  },

  async create(
    input: CreateProposalCommentInput,
    address: string
  ): Promise<ProposalComment> {
    const target = await resolveTarget(input.daoCode, input.proposalId);
    const response = await requestRemote<{
      createDiscussionComment: ProposalComment;
    }, { input: { targetId: string; body: string; replyToId?: string } }>(
      CREATE_PROPOSAL_COMMENT,
      {
        input: {
          targetId: target.id,
          body: input.body,
          replyToId: input.replyToId,
        },
      },
      address
    );
    return response.createDiscussionComment;
  },

  async update(
    input: UpdateProposalCommentInput,
    address: string
  ): Promise<ProposalComment> {
    const response = await requestRemote<{
      updateDiscussionComment: ProposalComment;
    }, { input: { commentId: string; body: string } }>(
      UPDATE_PROPOSAL_COMMENT,
      { input: { commentId: input.commentId, body: input.body } },
      address
    );
    return response.updateDiscussionComment;
  },

  async delete(
    input: DeleteProposalCommentInput,
    address: string
  ): Promise<ProposalComment> {
    const response = await requestRemote<{
      deleteDiscussionComment: ProposalComment;
    }, { input: { commentId: string } }>(
      DELETE_PROPOSAL_COMMENT,
      { input: { commentId: input.commentId } },
      address
    );
    return response.deleteDiscussionComment;
  },
};
