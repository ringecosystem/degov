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
      power
      toDelegate
      transactionHash
    }
  }
`;

export const GET_DELEGATE_MAPPINGS = gql`
  query GetDelegateMappings($where: DelegateMappingWhereInput!) {
    delegateMappings(where: $where) {
      blockNumber
      blockTimestamp
      from
      id
      to
      transactionHash
    }
  }
`;

export const GET_DELEGATE_MAPPINGS_CONNECTION = gql`
  query GetDelegateMappingsConnection(
    $where: DelegateWhereInput
    $orderBy: [DelegateOrderByInput!]!
  ) {
    delegatesConnection(where: $where, orderBy: $orderBy) {
      totalCount
    }
  }
`;
