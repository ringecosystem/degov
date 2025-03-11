import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useBlockNumber } from "wagmi";

import { DEFAULT_REFETCH_INTERVAL } from "@/config/base";
import { INDEXER_CONFIG } from "@/config/indexer";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { squidStatusService } from "@/services/graphql";

export type BlockSyncStatus = "operational" | "syncing" | "offline";
export function useBlockSync() {
  const daoConfig = useDaoConfig();

  const { data: currentBlockData } = useBlockNumber({
    watch: true,
    chainId: daoConfig?.chain?.id,
    query: {
      refetchInterval: DEFAULT_REFETCH_INTERVAL,
    },
  });

  const { data: squidStatus, isLoading } = useQuery({
    queryKey: ["squidStatus", daoConfig?.indexer?.endpoint],
    queryFn: async () => {
      if (!daoConfig?.indexer?.endpoint) return null;
      return squidStatusService.getSquidStatus(daoConfig.indexer.endpoint);
    },
    enabled: !!daoConfig?.indexer?.endpoint,
    refetchInterval: DEFAULT_REFETCH_INTERVAL,
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
