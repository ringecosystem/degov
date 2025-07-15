import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

import { useCurrentBlockTime, useCurrentBlockNumber } from "@/contexts/BlockContext";

import { useDaoConfig } from "./useDaoConfig";

/**
 * Hook to get the actual timestamps of voteStart and voteEnd blocks
 * For future blocks (voteEnd), estimates the timestamp based on current block time
 */
export function useVotingPeriodTimestamps(
  voteStartBlockNumber: string | null,
  voteEndBlockNumber: string | null
) {
  const publicClient = usePublicClient();
  const daoConfig = useDaoConfig();
  const currentBlockNumber = useCurrentBlockNumber();
  const currentBlockTime = useCurrentBlockTime();

  return useQuery({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: [
      "votingPeriodTimestamps",
      daoConfig?.chain?.id,
      voteStartBlockNumber,
      voteEndBlockNumber,
      currentBlockNumber?.toString(),
      publicClient ? 'client-present' : 'no-client',
    ],
    queryFn: async () => {
      if (
        !publicClient ||
        !voteStartBlockNumber ||
        !voteEndBlockNumber ||
        !currentBlockNumber
      ) {
        throw new Error(
          "Public client, vote block numbers, or current block number not available"
        );
      }

      const voteStartBlockNum = BigInt(voteStartBlockNumber);
      const voteEndBlockNum = BigInt(voteEndBlockNumber);
      const currentBlockNum = currentBlockNumber;

      // Always fetch voteStart block (should exist)
      const voteStartBlock = await publicClient.getBlock({
        blockNumber: voteStartBlockNum,
      });

      let voteEndTimestamp: bigint;

      // Check if voteEnd block exists (is in the past)
      if (voteEndBlockNum <= currentBlockNum) {
        // Block exists, fetch actual timestamp
        const voteEndBlock = await publicClient.getBlock({
          blockNumber: voteEndBlockNum,
        });
        voteEndTimestamp = voteEndBlock.timestamp * 1000n;
      } else {
        // Block is in the future, estimate timestamp
        if (!currentBlockTime) {
          throw new Error(
            "Current block time not available for future block estimation"
          );
        }

        const currentBlock = await publicClient.getBlock({
          blockNumber: currentBlockNum,
        });
        const blocksUntilEnd = Number(voteEndBlockNum - currentBlockNum);
        const estimatedSecondsUntilEnd = blocksUntilEnd * currentBlockTime;
        voteEndTimestamp =
          (currentBlock.timestamp + BigInt(estimatedSecondsUntilEnd)) * 1000n;
      }

      return {
        voteStartTimestamp: voteStartBlock.timestamp * 1000n,
        voteEndTimestamp,
        isFutureBlock: voteEndBlockNum > currentBlockNum,
      };
    },
    enabled:
      !!publicClient &&
      !!voteStartBlockNumber &&
      !!voteEndBlockNumber &&
      !!currentBlockNumber &&
      !!daoConfig?.chain?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes for future blocks
    retry: 3,
  });
}

/**
 * Hook to get the actual timestamp of the voteEnd block
 * This provides accurate voting period end time instead of estimated calculation
 */
export function useVoteEndTimestamp(voteEndBlockNumber: string | null) {
  const publicClient = usePublicClient();
  const daoConfig = useDaoConfig();

  return useQuery({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: [
      "voteEndTimestamp",
      daoConfig?.chain?.id,
      voteEndBlockNumber,
      publicClient ? 'client-present' : 'no-client',
    ],
    queryFn: async () => {
      if (!publicClient || !voteEndBlockNumber) {
        throw new Error("Public client or voteEnd block number not available");
      }

      const block = await publicClient.getBlock({
        blockNumber: BigInt(voteEndBlockNumber),
      });

      // Convert to milliseconds for consistency with other timestamps
      return block.timestamp * 1000n;
    },
    enabled: !!publicClient && !!voteEndBlockNumber && !!daoConfig?.chain?.id,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - block timestamps don't change
    retry: 3,
  });
}
