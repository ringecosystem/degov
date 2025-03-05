import { gql } from "graphql-request";

// delegates(limit: 10, offset: 10, orderBy: id_ASC, where: {}) {
//     blockNumber
//     blockTimestamp
//     delegator
//     fromDelegate
//     fromNewVotes
//     fromPreviousVotes
//     id
//     toDelegate
//     toNewVotes
//     toPreviousVotes
//     transactionHash
//   }

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
      delegator
      fromDelegate
      fromNewVotes
      fromPreviousVotes
      id
      toDelegate
      toNewVotes
      toPreviousVotes
      transactionHash
    }
  }
`;
