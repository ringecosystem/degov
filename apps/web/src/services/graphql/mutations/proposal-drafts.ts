const DRAFT_FIELDS = `
  id
  daoCode
  chainId
  title
  payload
  payloadVersion
  revision
  ctime
  utime
`;

export const SAVE_PROPOSAL_DRAFT = `
  mutation SaveProposalDraft($input: SaveProposalDraftInput!) {
    saveProposalDraft(input: $input) {
      ${DRAFT_FIELDS}
    }
  }
`;

export const DELETE_PROPOSAL_DRAFT = `
  mutation DeleteProposalDraft($input: DeleteProposalDraftInput!) {
    deleteProposalDraft(input: $input)
  }
`;
