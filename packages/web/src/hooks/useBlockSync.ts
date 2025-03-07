import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useBlockNumber } from "wagmi";

import { INDEXER_CONFIG } from "@/config/indexer";
import { useConfig } from "@/hooks/useConfig";
import { squidStatusService } from "@/services/graphql";

export type BlockSyncStatus = "operational" | "syncing" | "offline";
export function useBlockSync() {
  const daoConfig = useConfig();

  const { data: currentBlockData } = useBlockNumber({
    watch: true,
    query: {
      refetchInterval: 10_000,
    },
  });

  const { data: squidStatus, isLoading } = useQuery({
    queryKey: ["squidStatus", daoConfig?.indexer?.endpoint],
    queryFn: async () => {
      if (!daoConfig?.indexer?.endpoint) return null;
      return squidStatusService.getSquidStatus(daoConfig.indexer.endpoint);
    },
    enabled: !!daoConfig?.indexer?.endpoint,
    refetchInterval: 10_000,
  });

  const currentBlock = currentBlockData ? Number(currentBlockData) : 0;
  const indexedBlock = squidStatus?.height ? Number(squidStatus.height) : 0;

  const syncPercentage = useMemo(() => {
    if (!currentBlock || !indexedBlock) return 0;
    return Math.floor((indexedBlock / currentBlock) * 100);
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
