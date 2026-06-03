import { gql } from "graphql-request";

export const GET_INDEXER_STATUS = gql`
  query indexerStatus {
    indexerStatus {
      daoCode
      processedHeight
      targetHeight
      syncedPercentage
      isSynced
    }
  }
`;
