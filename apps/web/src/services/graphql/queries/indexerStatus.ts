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

export const GET_INDEXER_STATUS_WITH_PROVISIONAL_HEIGHT = gql`
  query indexerStatus {
    indexerStatus {
      daoCode
      processedHeight
      provisionalHeight
      targetHeight
      syncedPercentage
      isSynced
    }
  }
`;
