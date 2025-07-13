"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useBlockNumber, usePublicClient } from "wagmi";

import { DEFAULT_REFETCH_INTERVAL } from "@/config/base";
import { useDaoConfig } from "@/hooks/useDaoConfig";

interface BlockContextValue {
  /** Current block number */
  currentBlockNumber: bigint | null;
  /** Current block production time in seconds */
  currentBlockTime: number | null;
  /** Average block production time over larger sample */
  averageBlockTime: number | null;
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
  /** Number of blocks to sample for average calculation (default: 10) */
  sampleSize?: number;
  /** Whether to watch for new blocks (default: true) */
  watch?: boolean;
}

export function BlockProvider({
  children,
  sampleSize = 10,
  watch = true,
}: BlockProviderProps) {
  const daoConfig = useDaoConfig();
  const publicClient = usePublicClient();

  // Single source of truth for block number
  const { data: currentBlockNumber } = useBlockNumber({
    watch,
    chainId: daoConfig?.chain?.id,
    query: {
      refetchInterval: watch ? DEFAULT_REFETCH_INTERVAL : undefined,
    },
  });

  // Single block time calculation
  const {
    data: blockTimeData,
    isLoading,
    error,
    isFetching,
  } = useQuery({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: [
      "globalBlockTime",
      daoConfig?.chain?.id,
      currentBlockNumber?.toString(),
      sampleSize,
      publicClient ? "client-present" : "no-client",
    ],
    queryFn: async () => {
      if (!publicClient || !currentBlockNumber) {
        throw new Error("Public client or block number not available");
      }

      // Ensure we have enough blocks to sample
      if (currentBlockNumber < BigInt(sampleSize)) {
        throw new Error(
          `Not enough blocks to sample. Current: ${currentBlockNumber}, Required: ${sampleSize}`
        );
      }

      try {
        // Fetch multiple consecutive blocks in parallel
        const blocks = await Promise.all(
          Array.from({ length: sampleSize + 1 }, (_, i) =>
            publicClient.getBlock({
              blockNumber: currentBlockNumber - BigInt(i),
            })
          )
        );

        // Calculate time differences between consecutive blocks
        const blockTimes: number[] = [];
        for (let i = 0; i < blocks.length - 1; i++) {
          const timeDiff = Number(
            blocks[i].timestamp - blocks[i + 1].timestamp
          );

          // Validate reasonable block time (1-300 seconds)
          if (timeDiff > 0 && timeDiff <= 300) {
            blockTimes.push(timeDiff);
          }
        }

        if (blockTimes.length === 0) {
          throw new Error("No valid block times found");
        }

        const currentBlockTime = blockTimes[0]; // Most recent
        const averageBlockTime =
          blockTimes.reduce((sum, time) => sum + time, 0) / blockTimes.length;

        return {
          currentBlockTime,
          averageBlockTime,
          blockTimes,
        };
      } catch (err) {
        throw new Error(
          `Failed to fetch block data: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
      }
    },
    enabled: !!publicClient && !!currentBlockNumber && !!daoConfig?.chain?.id,
    staleTime: DEFAULT_REFETCH_INTERVAL / 2,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  const value = useMemo(
    (): BlockContextValue => ({
      currentBlockNumber: currentBlockNumber ?? null,
      currentBlockTime: blockTimeData?.currentBlockTime ?? null,
      averageBlockTime: blockTimeData?.averageBlockTime ?? null,
      chainId: daoConfig?.chain?.id ?? null,
      isLoading,
      error,
      isFetching,
    }),
    [
      currentBlockNumber,
      blockTimeData,
      daoConfig?.chain?.id,
      isLoading,
      error,
      isFetching,
    ]
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

// Convenience hooks for specific data
export function useCurrentBlockNumber(): bigint | null {
  return useBlockData().currentBlockNumber;
}

export function useCurrentBlockTime(): number | null {
  return useBlockData().currentBlockTime;
}

export function useAverageBlockTime(): number | null {
  return useBlockData().averageBlockTime;
}
