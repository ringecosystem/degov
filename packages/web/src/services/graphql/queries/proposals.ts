import { gql } from "graphql-request";
export const PROPOSAL_FRAGMENT = gql`
  fragment ProposalItem on ProposalCreated {
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
  }
`;

export const GET_ALL_PROPOSALS = gql`
  query GetAllProposals(
    $limit: Int
    $offset: Int
    $orderBy: [ProposalCreatedOrderByInput!]
    $where: ProposalCreatedWhereInput
  ) {
    proposalCreateds(
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
    }
  }
`;

// proposalCreatedById
export const GET_PROPOSAL_BY_ID = gql`
  query GetProposalById($id: String!) {
    proposalCreatedById(id: $id) {
      ...ProposalItem
    }
  }
  ${PROPOSAL_FRAGMENT}
`;

// proposalCanceledById
export const GET_PROPOSAL_CANCELED_BY_ID = gql`
  query GetProposalCanceledById($id: String!) {
    proposalCanceledById(id: $id) {
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
  query GetProposalExecutedById($id: String!) {
    proposalExecutedById(id: $id) {
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
  query GetProposalQueuedById($id: String!) {
    proposalQueuedById(id: $id) {
      blockNumber
      blockTimestamp
      etaSeconds
      id
      proposalId
      transactionHash
    }
  }
`;
