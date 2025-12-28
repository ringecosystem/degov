import { isNil } from "lodash-es";
import { useMemo } from "react";
import { useBlockNumber, useReadContract, useReadContracts } from "wagmi";

import { abi as governorAbi } from "@/config/abi/governor";
import { abi as timeLockAbi } from "@/config/abi/timeLock";
import { useBlockData } from "@/contexts/BlockContext";
import { useClockMode } from "@/hooks/useClockMode";
import { CACHE_TIMES, QUERY_CONFIGS } from "@/utils/query-config";

import { useDaoConfig } from "./useDaoConfig";

import type { Address } from "viem";

interface GovernanceParamsOptions {
  enabled?: boolean;
}

interface StaticGovernanceParams {
  proposalThreshold: bigint;
  votingDelay: bigint;
  votingPeriod: bigint;
  timeLockDelay?: bigint;
  // Time conversion info for blocknumber mode
  votingDelayInSeconds: number | null;
  votingPeriodInSeconds: number | null;
  timeLockDelayInSeconds?: number | null;
}

interface GovernanceParams extends StaticGovernanceParams {
  quorum: bigint;
}

export function useStaticGovernanceParams(
  options: GovernanceParamsOptions = {}
) {
  const { enabled = true } = options;
  const daoConfig = useDaoConfig();
  const governorAddress = daoConfig?.contracts?.governor as Address;
  const timeLockAddress = daoConfig?.contracts?.timeLock as Address;

  // Get clock mode and block time for conversion
  const {
    isBlockNumberMode,
    isLoading: isClockModeLoading,
    isResolved: isClockResolved,
  } = useClockMode();

  // Get block time and loading state
  const { blockTime: averageBlockTime, isLoading: isBlockTimeLoading } =
    useBlockData();
  const isBlockTimeReady = !isBlockTimeLoading && averageBlockTime !== null;

  const contracts = useMemo(() => {
    const baseContracts = [
      {
        address: governorAddress as `0x${string}`,
        abi: governorAbi,
        functionName: "proposalThreshold",
        chainId: daoConfig?.chain?.id,
      },
      {
        address: governorAddress as `0x${string}`,
        abi: governorAbi,
        functionName: "votingDelay",
        chainId: daoConfig?.chain?.id,
      },
      {
        address: governorAddress as `0x${string}`,
        abi: governorAbi,
        functionName: "votingPeriod",
        chainId: daoConfig?.chain?.id,
      },
    ];

    if (timeLockAddress) {
      baseContracts.push({
        address: timeLockAddress as `0x${string}`,
        // @ts-expect-error: The wagmi library's type definitions for the `abi` property are overly strict and do not account for all valid ABI formats.
        // This is a known issue, and the provided `timeLockAbi` is valid for the `getMinDelay` function.
        abi: timeLockAbi,
        functionName: "getMinDelay",
        chainId: daoConfig?.chain?.id,
      });
    }

    return baseContracts;
  }, [governorAddress, timeLockAddress, daoConfig?.chain?.id]);

  const { data, isLoading, error, isFetching } = useReadContracts({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contracts: contracts as any,
    query: {
      ...QUERY_CONFIGS.STATIC,
      enabled:
        enabled && Boolean(governorAddress) && Boolean(daoConfig?.chain?.id),
    },
  });

  const formattedData: StaticGovernanceParams | null = useMemo(() => {
    if (!data) return null;

    const proposalThreshold = data[0]?.result as bigint;
    const votingDelay = data[1]?.result as bigint;
    const votingPeriod = data[2]?.result as bigint;
    const timeLockDelay = (data?.[3]?.result as bigint) ?? undefined;

    if (isNil(proposalThreshold) || isNil(votingDelay) || isNil(votingPeriod)) {
      return null;
    }

    const shouldConvert = isClockResolved && isBlockNumberMode;

    const votingDelayInSeconds = (() => {
      if (!isClockResolved) return null;
      if (shouldConvert) {
        return isBlockTimeReady ? Number(votingDelay) * averageBlockTime : null;
      }
      return Number(votingDelay);
    })();

    const votingPeriodInSeconds = (() => {
      if (!isClockResolved) return null;
      if (shouldConvert) {
        return isBlockTimeReady
          ? Number(votingPeriod) * averageBlockTime
          : null;
      }
      return Number(votingPeriod);
    })();

    const timeLockDelayInSeconds = !isNil(timeLockDelay)
      ? Number(timeLockDelay)
      : null;

    return {
      proposalThreshold,
      votingDelay,
      votingPeriod,
      timeLockDelay,
      votingDelayInSeconds,
      votingPeriodInSeconds,
      timeLockDelayInSeconds,
    };
  }, [
    data,
    isBlockNumberMode,
    isClockResolved,
    averageBlockTime,
    isBlockTimeReady,
  ]);

  return {
    data: formattedData,
    isLoading: isLoading || isClockModeLoading || !isClockResolved,
    isFetching: isFetching || isClockModeLoading || !isClockResolved,
    error: error as Error | null,
    isBlockTimeLoading,
  };
}

export function useQuorum(options: GovernanceParamsOptions = {}) {
  const { enabled = true } = options;
  const daoConfig = useDaoConfig();
  const governorAddress = daoConfig?.contracts?.governor as Address;

  // Use the dedicated clock mode hook
  const {
    isBlockNumberMode,
    rawClockMode,
    isLoading: isClockModeLoading,
    status: clockModeStatus,
    isResolved: isClockResolved,
  } = useClockMode();

  // Get current block number from BlockContext
  const { data: blockNumber } = useBlockNumber({
    chainId: daoConfig?.chain?.id,
    query: {
      ...QUERY_CONFIGS.FREQUENT,
      refetchInterval: CACHE_TIMES.THIRTY_SECONDS,
      enabled:
        enabled &&
        Boolean(daoConfig?.chain?.id) &&
        isClockResolved &&
        isBlockNumberMode,
    },
  });

  const {
    data: clockData,
    isLoading: isClockLoading,
    isFetching: isClockFetching,
    refetch: refetchClock,
  } = useReadContract({
    address: governorAddress as `0x${string}`,
    abi: governorAbi,
    functionName: "clock" as const,
    chainId: daoConfig?.chain?.id,
    query: {
      ...QUERY_CONFIGS.FREQUENT,
      refetchInterval: CACHE_TIMES.THIRTY_SECONDS,
      enabled:
        enabled &&
        Boolean(governorAddress) &&
        Boolean(daoConfig?.chain?.id) &&
        isClockResolved &&
        !isBlockNumberMode,
    },
  });

  // Determine the correct parameter for quorum function based on clock mode
  // Use a slightly older block for stability (current block - 10)
  const stableBlockNumber = blockNumber ? blockNumber - 10n : 0n;
  const quorumParameter: bigint = isBlockNumberMode
    ? stableBlockNumber
    : typeof clockData === "bigint"
    ? clockData
    : 0n;

  const {
    data: quorumData,
    isLoading: isQuorumLoading,
    error: quorumError,
    isFetching: isQuorumFetching,
  } = useReadContract({
    address: governorAddress as `0x${string}`,
    abi: governorAbi,
    functionName: "quorum" as const,
    args: [quorumParameter],
    chainId: daoConfig?.chain?.id,
    query: {
      ...QUERY_CONFIGS.FREQUENT,
      refetchInterval: CACHE_TIMES.THIRTY_SECONDS,
      enabled:
        enabled &&
        Boolean(governorAddress) &&
        Boolean(daoConfig?.chain?.id) &&
        isClockResolved &&
        (isBlockNumberMode
          ? Boolean(blockNumber && blockNumber > 10n)
          : Boolean(clockData)),
    },
  });

  return {
    quorum: quorumData as bigint | undefined,
    clockData: clockData as bigint | undefined,
    clockMode: rawClockMode,
    isBlocknumberMode: isBlockNumberMode,
    isLoading:
      isClockLoading ||
      isQuorumLoading ||
      isClockModeLoading ||
      !isClockResolved,
    isFetching: isClockFetching || isQuorumFetching,
    error: quorumError,
    refetchClock,
    clockModeStatus,
  };
}

export function useGovernanceParams(options: GovernanceParamsOptions = {}) {
  const staticParams = useStaticGovernanceParams(options);
  const {
    quorum,
    clockMode,
    isBlocknumberMode,
    isLoading: isQuorumLoading,
    isFetching: isQuorumFetching,
    error: quorumError,
    refetchClock,
  } = useQuorum(options);

  const formattedData: GovernanceParams | null = useMemo(() => {
    if (!staticParams.data) return null;

    return {
      proposalThreshold: staticParams.data.proposalThreshold,
      votingDelay: staticParams.data.votingDelay,
      votingPeriod: staticParams.data.votingPeriod,
      timeLockDelay: staticParams.data.timeLockDelay,
      votingDelayInSeconds: staticParams.data.votingDelayInSeconds,
      votingPeriodInSeconds: staticParams.data.votingPeriodInSeconds,
      timeLockDelayInSeconds: staticParams.data.timeLockDelayInSeconds,
      quorum: quorum ?? 0n,
    };
  }, [staticParams.data, quorum]);

  return {
    data: formattedData,
    clockMode,
    isBlocknumberMode,
    isQuorumLoading,
    isQuorumFetching,
    isStaticLoading: staticParams.isLoading,
    isStaticFetching: staticParams.isFetching,
    isLoading: staticParams.isLoading || isQuorumLoading,
    isFetching: staticParams.isFetching || isQuorumFetching,
    error: staticParams.error || quorumError,
    refetchClock,
    isBlockTimeLoading: staticParams.isBlockTimeLoading,
  };
}
