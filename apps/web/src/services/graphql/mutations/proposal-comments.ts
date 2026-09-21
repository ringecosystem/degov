const COMMENT_FIELDS = `
  id
  targetId
  authorAddress
  replyToId
  body
  state
  ctime
  utime
`;

export const CREATE_PROPOSAL_COMMENT = `
  mutation CreateDiscussionComment($input: CreateDiscussionCommentInput!) {
    createDiscussionComment(input: $input) {
      ${COMMENT_FIELDS}
    }
  }
`;

export const UPDATE_PROPOSAL_COMMENT = `
  mutation UpdateDiscussionComment($input: UpdateDiscussionCommentInput!) {
    updateDiscussionComment(input: $input) {
      ${COMMENT_FIELDS}
    }
  }
`;

export const DELETE_PROPOSAL_COMMENT = `
  mutation DeleteDiscussionComment($input: DeleteDiscussionCommentInput!) {
    deleteDiscussionComment(input: $input) {
      ${COMMENT_FIELDS}
    }
  }
`;
