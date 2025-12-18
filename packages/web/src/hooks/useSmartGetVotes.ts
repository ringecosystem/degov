import { useMemo } from "react";
import { useReadContracts, useBlockNumber, useReadContract } from "wagmi";

import { abi as governorAbi } from "@/config/abi/governor";
import { abi as tokenAbi } from "@/config/abi/token";
import { useClockMode } from "@/hooks/useClockMode";
import { useDaoConfig } from "@/hooks/useDaoConfig";

import type { Address } from "viem";

interface UseSmartGetVotesProps {
  address?: Address;
  enabled?: boolean;
}

interface SmartGetVotesResult {
  data: bigint | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useSmartGetVotes({
  address,
  enabled = true,
}: UseSmartGetVotesProps): SmartGetVotesResult {
  const daoConfig = useDaoConfig();
  const shouldQuery = Boolean(address && daoConfig && enabled);

  const {
    isBlockNumberMode,
    isTimestampMode,
    isLoading: isClockModeLoading,
    isResolved: isClockResolved,
    status: clockModeStatus,
  } = useClockMode();
  const isClockReady = isClockResolved && clockModeStatus === "resolved";

  const { data: currentBlockNumber, isLoading: isBlockNumberLoading } =
    useBlockNumber({
      chainId: daoConfig?.chain?.id,
      query: {
        enabled:
          isClockReady &&
          isBlockNumberMode &&
          !isClockModeLoading &&
          shouldQuery,
      },
    });

  const { data: clockValue, isLoading: isClockLoading } = useReadContract({
    address: daoConfig?.contracts?.governor as Address,
    abi: governorAbi,
    functionName: "clock",
    chainId: daoConfig?.chain?.id,
    query: {
      enabled:
        shouldQuery &&
        isClockReady &&
        isTimestampMode &&
        Boolean(daoConfig?.contracts?.governor),
    },
  });
  const timepoint = useMemo(() => {
    if (!isClockReady || isClockModeLoading) return null;

    if (isTimestampMode) {
      return clockValue ? BigInt(clockValue) : null;
    }

    if (isBlockNumberMode && currentBlockNumber && currentBlockNumber > 1n) {
      return currentBlockNumber - 1n;
    }

    return null;
  }, [
    isBlockNumberMode,
    isTimestampMode,
    isClockModeLoading,
    currentBlockNumber,
    clockValue,
    isClockReady,
  ]);

  const {
    data: votingPowerData,
    isLoading: isVotingPowerLoading,
    refetch,
  } = useReadContracts({
    contracts: [
      {
        address: daoConfig?.contracts?.governorToken?.address as Address,
        abi: tokenAbi,
        functionName: "getVotes",
        args: [address!],
        chainId: daoConfig?.chain?.id,
      },
      {
        address: daoConfig?.contracts?.governor as Address,
        abi: governorAbi,
        functionName: "getVotes",
        args: [address!, timepoint!],
        chainId: daoConfig?.chain?.id,
      },
    ],
    allowFailure: true,
    query: {
      enabled: shouldQuery && timepoint !== null && timepoint > 0n,
    },
  });
  const isLoading =
    isVotingPowerLoading ||
    isClockLoading ||
    isClockModeLoading ||
    !isClockReady ||
    (isBlockNumberMode && isBlockNumberLoading);

  if (isLoading) {
    return {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch,
    };
  }

  const createResult = (
    data: bigint | undefined,
    isError: boolean,
    error: Error | null = null
  ) => ({
    data,
    isLoading: false,
    isError,
    error,
    refetch,
  });

  if (votingPowerData?.[0]?.status === "success") {
    const result = votingPowerData[0].result;
    return createResult(typeof result === "bigint" ? result : undefined, false);
  }

  if (votingPowerData?.[1]?.status === "success") {
    const result = votingPowerData[1].result;
    return createResult(typeof result === "bigint" ? result : undefined, false);
  }

  return createResult(
    undefined,
    true,
    new Error("Unable to fetch voting power from both token and governor")
  );
}

export function useCurrentVotingPower(address?: Address, enabled?: boolean) {
  return useSmartGetVotes({ address, enabled });
}
