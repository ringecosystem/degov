import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useBlockNumber } from "wagmi";

import { INDEXER_CONFIG } from "@/config/indexer";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { squidStatusService } from "@/services/graphql";
import { CACHE_TIMES } from "@/utils/query-config";

export type BlockSyncStatus = "operational" | "syncing" | "offline";
export function useBlockSync() {
  const daoConfig = useDaoConfig();

  const { data: currentBlockData } = useBlockNumber({
    watch: true,
    chainId: daoConfig?.chain?.id,
  });

  const { data: squidStatus, isLoading } = useQuery({
    queryKey: ["squidStatus", daoConfig?.indexer?.endpoint],
    queryFn: async () => {
      if (!daoConfig?.indexer?.endpoint) return null;
      return squidStatusService.getSquidStatus(daoConfig.indexer.endpoint);
    },
    enabled: !!daoConfig?.indexer?.endpoint,
    refetchInterval: CACHE_TIMES.THIRTY_SECONDS,
  });

  const currentBlock = currentBlockData ? Number(currentBlockData) : 0;
  const indexedBlock = squidStatus?.height ? Number(squidStatus.height) : 0;

  const syncPercentage = useMemo(() => {
    if (!currentBlock || !indexedBlock) return 0;
    const ratio = (indexedBlock / currentBlock) * 100;
    return Number(ratio.toFixed(1));
  }, [currentBlock, indexedBlock]);

  const status: BlockSyncStatus = useMemo(() => {
    if (!indexedBlock) return "offline";
    return syncPercentage >= INDEXER_CONFIG.OPERATIONAL_THRESHOLD
      ? "operational"
      : "syncing";
  }, [indexedBlock, syncPercentage]);

  return {
    currentBlock,
    indexedBlock,
    syncPercentage,
    isLoading,
    status,
  };
}
