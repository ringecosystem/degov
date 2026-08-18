const COMMENT_FIELDS = `
  id
  daoCode
  chainId
  proposalId
  authorAddress
  replyToId
  body
  state
  ctime
  utime
`;

export const CREATE_PROPOSAL_COMMENT = `
  mutation CreateProposalComment($input: CreateProposalCommentInput!) {
    createProposalComment(input: $input) {
      ${COMMENT_FIELDS}
    }
  }
`;

export const UPDATE_PROPOSAL_COMMENT = `
  mutation UpdateProposalComment($input: UpdateProposalCommentInput!) {
    updateProposalComment(input: $input) {
      ${COMMENT_FIELDS}
    }
  }
`;

export const DELETE_PROPOSAL_COMMENT = `
  mutation DeleteProposalComment($input: DeleteProposalCommentInput!) {
    deleteProposalComment(input: $input) {
      ${COMMENT_FIELDS}
    }
  }
`;
