export type IndexerStatus = {
  daoCode?: string;
  processedHeight?: number | null;
  targetHeight?: number | null;
  syncedPercentage?: number | null;
  isSynced?: boolean;
};

export type IndexerStatusResponse = {
  indexerStatus?: IndexerStatus | null;
};
