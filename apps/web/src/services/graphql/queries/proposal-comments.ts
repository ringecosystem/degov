export const PROPOSAL_COMMENTS = `
  query ProposalComments($input: ProposalCommentsInput!) {
    proposalComments(input: $input) {
      items {
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
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;
