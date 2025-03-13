import { gql } from "graphql-request";

export const GET_ALL_PROPOSALS = gql`
  query GetAllProposals(
    $limit: Int
    $offset: Int
    $orderBy: [ProposalOrderByInput!]
    $where: ProposalWhereInput
  ) {
    proposals(
      limit: $limit
      offset: $offset
      orderBy: $orderBy
      where: $where
    ) {
      blockNumber
      blockTimestamp
      calldatas
      description
      id
      proposalId
      proposer
      signatures
      targets
      transactionHash
      values
      voteEnd
      voteStart
      voters {
        blockNumber
        blockTimestamp
        id
        params
        reason
        support
        transactionHash
        type
        voter
        weight
      }
    }
  }
`;

export const GET_ALL_PROPOSALS_TOTAL = gql`
  query GetAllProposalsTotal($limit: Int, $offset: Int) {
    proposals(limit: $limit, offset: $offset) {
      proposalId
    }
  }
`;

// proposalCanceledById
export const GET_PROPOSAL_CANCELED_BY_ID = gql`
  query proposalCanceleds($where: ProposalCanceledWhereInput) {
    proposalCanceleds(where: $where) {
      id
      blockNumber
      blockTimestamp
      proposalId
      transactionHash
    }
  }
`;

// proposalExecutedById
export const GET_PROPOSAL_EXECUTED_BY_ID = gql`
  query GetProposalExecutedById($where: ProposalExecutedWhereInput) {
    proposalExecuteds(where: $where) {
      blockNumber
      blockTimestamp
      id
      proposalId
      transactionHash
    }
  }
`;

// proposalQueuedById
export const GET_PROPOSAL_QUEUED_BY_ID = gql`
  query GetProposalQueuedById($where: ProposalQueuedWhereInput) {
    proposalQueueds(where: $where) {
      blockNumber
      blockTimestamp
      etaSeconds
      id
      proposalId
      transactionHash
    }
  }
`;
