import { useMemo } from "react";
import { useReadContract, useBlockNumber } from "wagmi";

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
  const {
    isBlockNumberMode,
    isTimestampMode,
    isLoading: isClockModeLoading,
  } = useClockMode();
  const { data: currentBlockNumber } = useBlockNumber({
    chainId: daoConfig?.chain?.id,
  });

  const { data: clockData } = useReadContract({
    address: daoConfig?.contracts?.governor as Address,
    abi: governorAbi,
    functionName: "clock",
    chainId: daoConfig?.chain?.id,
    query: {
      enabled: Boolean(
        daoConfig?.contracts?.governor &&
          daoConfig?.chain?.id &&
          isTimestampMode
      ),
    },
  });

  const shouldQuery = Boolean(address && daoConfig && enabled);

  const {
    data: tokenVotingPower,
    isLoading: isTokenLoading,
    isError: isTokenError,
    refetch: refetchToken,
  } = useReadContract({
    address: daoConfig?.contracts?.governorToken?.address as Address,
    abi: tokenAbi,
    functionName: "getVotes",
    args: [address!],
    chainId: daoConfig?.chain?.id,
    query: {
      enabled: shouldQuery,
    },
  });

  const effectiveTimepoint = useMemo(() => {
    if (isClockModeLoading) {
      return null;
    }

    if (isBlockNumberMode && currentBlockNumber && currentBlockNumber > 0) {
      return BigInt(currentBlockNumber);
    }

    if (isTimestampMode && clockData && clockData > 0) {
      return BigInt(clockData);
    }

    return null;
  }, [
    isBlockNumberMode,
    isTimestampMode,
    isClockModeLoading,
    currentBlockNumber,
    clockData,
  ]);

  const shouldQueryGovernor = useMemo(() => {
    return (
      shouldQuery &&
      isTokenError &&
      !isClockModeLoading &&
      effectiveTimepoint !== null &&
      effectiveTimepoint > 0n &&
      Boolean(daoConfig?.contracts?.governor)
    );
  }, [
    shouldQuery,
    isTokenError,
    isClockModeLoading,
    effectiveTimepoint,
    daoConfig?.contracts?.governor,
  ]);

  const {
    data: governorVotingPower,
    isLoading: isGovernorLoading,
    isError: isGovernorError,
    error: governorError,
    refetch: refetchGovernor,
  } = useReadContract({
    address: daoConfig?.contracts?.governor as Address,
    abi: governorAbi,
    functionName: "getVotes",
    args: [address!, effectiveTimepoint || BigInt(0)],
    chainId: daoConfig?.chain?.id,
    query: {
      enabled: shouldQueryGovernor,
    },
  });

  return useMemo(() => {
    if (!isTokenError && tokenVotingPower !== undefined) {
      return {
        data: tokenVotingPower,
        isLoading: isTokenLoading,
        isError: false,
        error: null,
        refetch: refetchToken,
      };
    }

    if (isTokenError && !shouldQueryGovernor && effectiveTimepoint === null) {
      return {
        data: undefined,
        isLoading: isClockModeLoading,
        isError: true,
        error: new Error(
          "Cannot determine voting power: token query failed and timepoint is invalid"
        ),
        refetch: () => {
          refetchToken();
          if (shouldQueryGovernor) {
            refetchGovernor();
          }
        },
      };
    }

    return {
      data: governorVotingPower,
      isLoading: isGovernorLoading || isClockModeLoading,
      isError: isGovernorError,
      error: governorError,
      refetch: () => {
        refetchToken();
        refetchGovernor();
      },
    };
  }, [
    isTokenError,
    tokenVotingPower,
    isTokenLoading,
    refetchToken,
    shouldQueryGovernor,
    effectiveTimepoint,
    isClockModeLoading,
    governorVotingPower,
    isGovernorLoading,
    isGovernorError,
    governorError,
    refetchGovernor,
  ]);
}

export function useCurrentVotingPower(address?: Address, enabled?: boolean) {
  return useSmartGetVotes({ address, enabled });
}
