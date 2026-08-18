const DRAFT_METADATA_FIELDS = `
  id
  daoCode
  chainId
  title
  payloadVersion
  revision
  ctime
  utime
`;

export const MY_PROPOSAL_DRAFTS = `
  query MyProposalDrafts($input: ProposalDraftsInput!) {
    myProposalDrafts(input: $input) {
      items {
        ${DRAFT_METADATA_FIELDS}
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

export const PROPOSAL_DRAFT = `
  query ProposalDraft($input: ProposalDraftInput!) {
    proposalDraft(input: $input) {
      ${DRAFT_METADATA_FIELDS}
      payload
    }
  }
`;
