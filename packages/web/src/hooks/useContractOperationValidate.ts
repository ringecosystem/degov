import { getBlockNumber } from "@wagmi/core";
import { useCallback } from "react";
import { useConfig } from "wagmi";

import { squidStatusService } from "@/services/graphql";

import { useConfig as useDaoConfig } from "./useConfig";

export function useContractOperationValidate() {
  const config = useConfig();
  const daoConfig = useDaoConfig();

  const validateBlockSync = useCallback(async () => {
    if (!daoConfig?.indexer?.endpoint) return false;
    const indexedBlock = await squidStatusService.getSquidStatus(
      daoConfig.indexer.endpoint
    );
    const currentBlock = await getBlockNumber(config);
    if (currentBlock && currentBlock !== 0n) {
      return (indexedBlock?.height ?? 0) / Number(currentBlock) > 0.95;
    }
    return false;
  }, [daoConfig?.indexer?.endpoint, config]);

  return {
    validateBlockSync,
  };
}
