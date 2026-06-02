import { gql } from "graphql-request";

export const GET_SQUID_STATUS = gql`
  query squidStatus {
    squidStatus {
      finalizedHash
      height
      finalizedHeight
      hash
    }
  }
`;
