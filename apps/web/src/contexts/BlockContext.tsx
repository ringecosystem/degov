"use client";

import { useQuery } from "@tanstack/react-query";
import { getBlock } from "@wagmi/core";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useBlockNumber, useConfig } from "wagmi";

import { useDaoConfig } from "@/hooks/useDaoConfig";
import { QUERY_CONFIGS } from "@/utils/query-config";

// Sample 10 blocks total (current + previous 9) to smooth jitter while keeping RPC load reasonable.
const BLOCK_SAMPLE_SIZE = 9;

interface BlockContextValue {
  /** Average block production time (in seconds) based on recent blocks */
  blockTime: number | null;
  /** Chain ID */
  chainId: number | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Whether data is being fetched */
  isFetching: boolean;
}

const BlockContext = createContext<BlockContextValue | null>(null);

interface BlockProviderProps {
  children: ReactNode;
}

export function BlockProvider({ children }: BlockProviderProps) {
  const daoConfig = useDaoConfig();
  const chainId = daoConfig?.chain?.id;

  const config = useConfig();
  const { data: blockNumber } = useBlockNumber({
    chainId,
    watch: true,
    query: {
      ...QUERY_CONFIGS.DEFAULT,
    },
  });

  const {
    data: blockTime,
    isLoading,
    error,
    isFetching,
  } = useQuery({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: ["blockTime", blockNumber?.toString(), daoConfig?.chain?.id],
    queryFn: async () => {
      if (!blockNumber || blockNumber === 0n) {
        throw new Error("Block number not available");
      }

      if (blockNumber < BigInt(BLOCK_SAMPLE_SIZE)) {
        throw new Error(
          `Not enough blocks to sample. Current: ${blockNumber}, Required: ${
            BLOCK_SAMPLE_SIZE + 1
          }`
        );
      }

      const fromBlock = blockNumber - BigInt(BLOCK_SAMPLE_SIZE);
      const blockPromises = Array.from(
        { length: BLOCK_SAMPLE_SIZE + 1 },
        (_, idx) =>
          getBlock(config, {
            blockNumber: fromBlock + BigInt(idx),
            chainId: chainId,
          })
      );

      const rpcBlocks = await Promise.all(blockPromises);

      let totalInterval = 0;
      let intervalCount = 0;

      for (let i = 1; i < rpcBlocks.length; i++) {
        const currentBlock = rpcBlocks[i];
        const previousBlock = rpcBlocks[i - 1];

        if (currentBlock.timestamp && previousBlock.timestamp) {
          totalInterval += Number(
            currentBlock.timestamp - previousBlock.timestamp
          );
          intervalCount++;
        }
      }

      if (intervalCount === 0) {
        throw new Error("No valid block intervals found");
      }

      return Math.floor(totalInterval / intervalCount);
    },
    enabled: !!chainId && blockNumber != null,
    structuralSharing: false,
    ...QUERY_CONFIGS.DEFAULT,
  });

  const value = useMemo(
    (): BlockContextValue => ({
      blockTime: blockTime ?? null,
      chainId: chainId ?? null,
      isLoading,
      error,
      isFetching,
    }),
    [blockTime, chainId, isLoading, error, isFetching]
  );

  return (
    <BlockContext.Provider value={value}>{children}</BlockContext.Provider>
  );
}

export function useBlockData(): BlockContextValue {
  const context = useContext(BlockContext);
  if (!context) {
    throw new Error("useBlockData must be used within BlockProvider");
  }
  return context;
}

export function useBlockInterval(): number | null {
  return useBlockData().blockTime;
}
