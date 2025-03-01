import { gql } from "graphql-request";

export const GET_ALL_PROPOSALS = gql`
  query GetAllProposals(
    $limit: Int
    $offset: Int
    $orderBy: ProposalCreatedOrderByInput
    $where: ProposalCreatedWhereInput
  ) {
    proposalCreateds(
      first: $limit
      after: $offset
      orderBy: $orderBy
      where: $where
    ) {
      nodes {
        id
        proposalId
        proposer
        targets
        values
        signatures
        calldatas
        startBlock
        endBlock
        description
        createdTimestamp
        createdBlock
        createdTransactionHash
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`;
