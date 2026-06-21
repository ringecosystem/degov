import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useBlockNumber } from "wagmi";

import { INDEXER_CONFIG } from "@/config/indexer";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { indexerStatusService } from "@/services/graphql";
import { CACHE_TIMES } from "@/utils/query-config";

export type BlockSyncStatus = "operational" | "syncing" | "offline";

const toBlockNumber = (height?: number | null) =>
  height !== null && height !== undefined ? Number(height) : 0;

export function useBlockSync() {
  const daoConfig = useDaoConfig();

  const { data: currentBlockData } = useBlockNumber({
    watch: true,
    chainId: daoConfig?.chain?.id,
  });

  const { data: indexerStatus, isLoading } = useQuery({
    queryKey: ["indexerStatus", daoConfig?.indexer?.endpoint],
    queryFn: async () => {
      if (!daoConfig?.indexer?.endpoint) return null;
      return indexerStatusService.getIndexerStatus(daoConfig.indexer.endpoint);
    },
    enabled: !!daoConfig?.indexer?.endpoint,
    refetchInterval: CACHE_TIMES.TWO_SECONDS,
  });

  const currentBlock = currentBlockData ? Number(currentBlockData) : 0;
  const processedBlock = toBlockNumber(indexerStatus?.processedHeight);
  const indexedBlock = toBlockNumber(
    indexerStatus?.latestProcessedHeight ??
      indexerStatus?.provisionalHeight ??
      indexerStatus?.processedHeight
  );
  const nativeSyncPercentage = indexerStatus?.syncedPercentage;

  const syncPercentage = useMemo(() => {
    if (nativeSyncPercentage !== null && nativeSyncPercentage !== undefined) {
      return Number(Number(nativeSyncPercentage).toFixed(1));
    }

    if (!currentBlock || !indexedBlock) return 0;
    const ratio = (indexedBlock / currentBlock) * 100;
    return Number(ratio.toFixed(1));
  }, [currentBlock, indexedBlock, nativeSyncPercentage]);

  const status: BlockSyncStatus = useMemo(() => {
    if (!indexedBlock) return "offline";
    return syncPercentage >= INDEXER_CONFIG.OPERATIONAL_THRESHOLD
      ? "operational"
      : "syncing";
  }, [indexedBlock, syncPercentage]);

  return {
    currentBlock,
    indexedBlock,
    processedBlock,
    syncPercentage,
    isLoading,
    status,
  };
}
