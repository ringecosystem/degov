import { gql } from "graphql-request";

export const GET_GOVERNANCE_COUNTS = gql`
  query GetGovernanceCounts {
    proposalsConnection(orderBy: id_ASC) {
      totalCount
    }
    contributorsConnection(orderBy: id_ASC) {
      totalCount
    }
  }
`;
