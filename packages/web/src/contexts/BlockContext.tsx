"use client";

import { useQuery } from "@tanstack/react-query";
import { getBlock } from "@wagmi/core";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useBlockNumber, useConfig } from "wagmi";

import { useDaoConfig } from "@/hooks/useDaoConfig";
import { QUERY_CONFIGS } from "@/utils/query-config";

const BLOCK_SAMPLE_SIZE = 2;

interface BlockContextValue {
  /** Block production time based on last 10 blocks */
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

  const config = useConfig();
  const { data: blockNumber } = useBlockNumber({
    chainId: daoConfig?.chain?.id,
    watch: false,
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
    queryKey: [
      "blockTime",
      String(blockNumber ?? ""),
      Number(daoConfig?.chain?.id ?? 0),
    ],
    queryFn: async () => {
      if (!blockNumber) {
        throw new Error("Block number not available");
      }

      // Ensure we have enough blocks to sample
      if (blockNumber < BigInt(BLOCK_SAMPLE_SIZE)) {
        throw new Error(
          `Not enough blocks to sample. Current: ${blockNumber}, Required: ${
            BLOCK_SAMPLE_SIZE + 1
          }`
        );
      }

      try {
        // Fetch last 10 blocks using direct JSON-RPC calls
        const fromBlock = blockNumber - BigInt(BLOCK_SAMPLE_SIZE);
        const blockPromises: Promise<{
          timestamp: bigint;
          number: bigint;
          hash: string;
        }>[] = [];

        for (let i = fromBlock; i <= blockNumber; i = i + 1n) {
          blockPromises.push(
            getBlock(config, {
              blockNumber: i,
              chainId: daoConfig?.chain?.id,
            })
          );
        }

        const rpcBlocks = await Promise.all(blockPromises);

        if (rpcBlocks.length < 2) {
          throw new Error("Need at least 2 blocks to calculate interval");
        }

        // Calculate average block interval from last 10 blocks
        let totalInterval = 0;
        let intervalCount = 0;

        for (let i = 1; i < rpcBlocks.length; i++) {
          const currentBlock = rpcBlocks[i];
          const previousBlock = rpcBlocks[i - 1];

          if (currentBlock.timestamp && previousBlock.timestamp) {
            const interval = Number(
              currentBlock.timestamp - previousBlock.timestamp
            );
            totalInterval += interval;
            intervalCount++;
          }
        }

        if (intervalCount === 0) {
          throw new Error("No valid block intervals found");
        }
        const averageInterval = Math.floor(totalInterval / intervalCount);

        return averageInterval;
      } catch (err) {
        throw new Error(
          `Failed to fetch block data: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
      }
    },
    enabled: !!daoConfig?.chain?.id,
    ...QUERY_CONFIGS.DEFAULT,
  });
  const value = useMemo(
    (): BlockContextValue => ({
      blockTime: blockTime ?? null,
      chainId: daoConfig?.chain?.id ?? null,
      isLoading,
      error,
      isFetching,
    }),
    [blockTime, daoConfig?.chain?.id, isLoading, error, isFetching]
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
