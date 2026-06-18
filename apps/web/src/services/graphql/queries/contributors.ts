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
    $where: ContributorWhereInput
  ) {
    contributors(
      limit: $limit
      offset: $offset
      orderBy: $orderBy
      where: $where
    ) {
      blockNumber
      blockTimestamp
      lastVoteTimestamp
      id
      power
      delegatesCountAll
      transactionHash
    }
  }
`;

export const GET_CONTRIBUTORS_PAGE = gql`
  query GetContributorsPage(
    $limit: Int
    $offset: Int
    $orderBy: [ContributorOrderByInput!]
    $where: ContributorWhereInput
  ) {
    contributorsPage(
      limit: $limit
      offset: $offset
      orderBy: $orderBy
      where: $where
    ) {
      totalCount
      offset
      limit
      items {
        id
        delegatesCountAll
      }
    }
  }
`;

export const GET_DELEGATE_PROFILES_COUNT = gql`
  query GetDelegateProfilesCount($where: DelegateWhereInput) {
    delegateProfilesCount(where: $where)
  }
`;
