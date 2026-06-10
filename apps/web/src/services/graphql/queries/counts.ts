import { gql } from "graphql-request";

export const GET_GOVERNANCE_COUNTS = gql`
  query GetGovernanceCounts {
    proposalsPage(orderBy: id_ASC, limit: 0) {
      totalCount
    }
    contributorsPage(orderBy: id_ASC, limit: 0) {
      totalCount
    }
  }
`;
