import { gql } from "graphql-request";

export const GET_DELEGATES = gql`
  query GetDelegates(
    $limit: Int
    $offset: Int
    $orderBy: [DelegateOrderByInput!]
    $where: DelegateWhereInput
  ) {
    delegates(
      limit: $limit
      offset: $offset
      orderBy: $orderBy
      where: $where
    ) {
      blockNumber
      blockTimestamp
      fromDelegate
      id
      isCurrent
      power
      toDelegate
      transactionHash
    }
  }
`;

export const GET_DELEGATES_CONNECTION = gql`
  query GetDelegatesConnection(
    $where: DelegateWhereInput
    $orderBy: [DelegateOrderByInput!]!
  ) {
    delegatesConnection(where: $where, orderBy: $orderBy) {
      totalCount
    }
  }
`;

export const GET_DELEGATE_MAPPINGS = gql`
  query GetDelegateMappings(
    $limit: Int
    $offset: Int
    $orderBy: [DelegateMappingOrderByInput!]
    $where: DelegateMappingWhereInput!
  ) {
    delegateMappings(
      limit: $limit
      offset: $offset
      orderBy: $orderBy
      where: $where
    ) {
      blockNumber
      blockTimestamp
      from
      id
      power
      to
      transactionHash
    }
  }
`;

export const GET_DELEGATE_MAPPINGS_CONNECTION = gql`
  query GetDelegateMappingsConnection(
    $where: DelegateMappingWhereInput
    $orderBy: [DelegateMappingOrderByInput!]!
  ) {
    delegateMappingsConnection(where: $where, orderBy: $orderBy) {
      totalCount
    }
  }
`;
