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

export const GET_DELEGATES_PAGE = gql`
  query GetDelegatesPage(
    $limit: Int
    $offset: Int
    $where: DelegateWhereInput
    $orderBy: [DelegateOrderByInput!]!
  ) {
    delegatesPage(
      limit: $limit
      offset: $offset
      where: $where
      orderBy: $orderBy
    ) {
      totalCount
      offset
      limit
      items {
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

export const GET_DELEGATE_MAPPINGS_PAGE = gql`
  query GetDelegateMappingsPage(
    $limit: Int
    $offset: Int
    $where: DelegateMappingWhereInput
    $orderBy: [DelegateMappingOrderByInput!]!
  ) {
    delegateMappingsPage(
      limit: $limit
      offset: $offset
      where: $where
      orderBy: $orderBy
    ) {
      totalCount
      offset
      limit
      items {
        blockNumber
        blockTimestamp
        from
        id
        power
        to
        transactionHash
      }
    }
  }
`;
