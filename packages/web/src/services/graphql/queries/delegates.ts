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
