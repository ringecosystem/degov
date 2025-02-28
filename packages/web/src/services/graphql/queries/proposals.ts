import { gql } from "graphql-request";

const PROPOSAL_CREATED_FRAGMENT = gql`
  fragment ProposalCreatedFields on ProposalCreated {
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
`;

const PROPOSAL_EXECUTED_FRAGMENT = gql`
  fragment ProposalExecutedFields on ProposalExecuted {
    id
    proposalId
    executedTimestamp
    executedBlock
    executedTransactionHash
  }
`;

const PROPOSAL_CANCELED_FRAGMENT = gql`
  fragment ProposalCanceledFields on ProposalCanceled {
    id
    proposalId
    canceledTimestamp
    canceledBlock
    canceledTransactionHash
  }
`;

const PROPOSAL_QUEUED_FRAGMENT = gql`
  fragment ProposalQueuedFields on ProposalQueued {
    id
    proposalId
    eta
    queuedTimestamp
    queuedBlock
    queuedTransactionHash
  }
`;

export const GET_PROPOSAL_CREATED_BY_ID = gql`
  ${PROPOSAL_CREATED_FRAGMENT}
  query ProposalCreatedById($id: ID!) {
    proposalCreatedById(id: $id) {
      ...ProposalCreatedFields
    }
  }
`;

export const GET_PROPOSAL_CREATEDS = gql`
  ${PROPOSAL_CREATED_FRAGMENT}
  query ProposalCreateds(
    $first: Int
    $after: String
    $orderBy: ProposalCreatedOrderByInput
  ) {
    proposalCreateds(first: $first, after: $after, orderBy: $orderBy) {
      nodes {
        ...ProposalCreatedFields
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
`;

export const GET_PROPOSAL_CREATEDS_CONNECTION = gql`
  ${PROPOSAL_CREATED_FRAGMENT}
  query ProposalCreatedsConnection(
    $first: Int
    $after: String
    $orderBy: ProposalCreatedOrderByInput
  ) {
    proposalCreatedsConnection(
      first: $first
      after: $after
      orderBy: $orderBy
    ) {
      nodes {
        ...ProposalCreatedFields
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
`;

export const GET_PROPOSAL_CANCELED_BY_ID = gql`
  ${PROPOSAL_CANCELED_FRAGMENT}
  query ProposalCanceledById($id: ID!) {
    proposalCanceledById(id: $id) {
      ...ProposalCanceledFields
    }
  }
`;

export const GET_PROPOSAL_CANCELEDS = gql`
  ${PROPOSAL_CANCELED_FRAGMENT}
  query ProposalCanceleds(
    $first: Int
    $after: String
    $orderBy: ProposalCanceledOrderByInput
  ) {
    proposalCanceleds(first: $first, after: $after, orderBy: $orderBy) {
      nodes {
        ...ProposalCanceledFields
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
`;

export const GET_PROPOSAL_CANCELEDS_CONNECTION = gql`
  ${PROPOSAL_CANCELED_FRAGMENT}
  query ProposalCanceledsConnection(
    $first: Int
    $after: String
    $orderBy: ProposalCanceledOrderByInput
  ) {
    proposalCanceledsConnection(
      first: $first
      after: $after
      orderBy: $orderBy
    ) {
      nodes {
        ...ProposalCanceledFields
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
`;

export const GET_PROPOSAL_EXECUTED_BY_ID = gql`
  ${PROPOSAL_EXECUTED_FRAGMENT}
  query ProposalExecutedById($id: ID!) {
    proposalExecutedById(id: $id) {
      ...ProposalExecutedFields
    }
  }
`;

export const GET_PROPOSAL_EXECUTEDS = gql`
  ${PROPOSAL_EXECUTED_FRAGMENT}
  query ProposalExecuteds(
    $first: Int
    $after: String
    $orderBy: ProposalExecutedOrderByInput
  ) {
    proposalExecuteds(first: $first, after: $after, orderBy: $orderBy) {
      nodes {
        ...ProposalExecutedFields
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
`;

export const GET_PROPOSAL_EXECUTEDS_CONNECTION = gql`
  ${PROPOSAL_EXECUTED_FRAGMENT}
  query ProposalExecutedsConnection(
    $first: Int
    $after: String
    $orderBy: ProposalExecutedOrderByInput
  ) {
    proposalExecutedsConnection(
      first: $first
      after: $after
      orderBy: $orderBy
    ) {
      nodes {
        ...ProposalExecutedFields
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
`;

export const GET_PROPOSAL_QUEUED_BY_ID = gql`
  ${PROPOSAL_QUEUED_FRAGMENT}
  query ProposalQueuedById($id: ID!) {
    proposalQueuedById(id: $id) {
      ...ProposalQueuedFields
    }
  }
`;

export const GET_PROPOSAL_QUEUEDS = gql`
  ${PROPOSAL_QUEUED_FRAGMENT}
  query ProposalQueueds(
    $first: Int
    $after: String
    $orderBy: ProposalQueuedOrderByInput
  ) {
    proposalQueueds(first: $first, after: $after, orderBy: $orderBy) {
      nodes {
        ...ProposalQueuedFields
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
`;

export const GET_PROPOSAL_QUEUEDS_CONNECTION = gql`
  ${PROPOSAL_QUEUED_FRAGMENT}
  query ProposalQueuedsConnection(
    $first: Int
    $after: String
    $orderBy: ProposalQueuedOrderByInput
  ) {
    proposalQueuedsConnection(first: $first, after: $after, orderBy: $orderBy) {
      nodes {
        ...ProposalQueuedFields
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
`;
