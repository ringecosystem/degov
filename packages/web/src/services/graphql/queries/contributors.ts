// query MyQuery {
//     contributors(orderBy: power_DESC) {
//       blockNumber
//       blockTimestamp
//       id
//       power
//       transactionHash
//     }
//   }

import { gql } from "graphql-request";

export const GET_CONTRIBUTORS = gql`
  query GetContributors(
    $limit: Int
    $offset: Int
    $orderBy: [ContributorOrderByInput!]
  ) {
    contributors(limit: $limit, offset: $offset, orderBy: $orderBy) {
      blockNumber
      blockTimestamp
      id
      power
      transactionHash
    }
  }
`;
