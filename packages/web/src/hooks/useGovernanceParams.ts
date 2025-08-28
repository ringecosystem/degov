import { isNil } from "lodash-es";
import { useMemo } from "react";
import { useBlockNumber, useReadContract, useReadContracts } from "wagmi";

import { abi as governorAbi } from "@/config/abi/governor";
import { abi as timeLockAbi } from "@/config/abi/timeLock";
import { useBlockInterval } from "@/contexts/BlockContext";
import { useClockModeContext } from "@/contexts/ClockModeContext";

import { useDaoConfig } from "./useDaoConfig";

import type { Address } from "viem";

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

export function useStaticGovernanceParams() {
  const daoConfig = useDaoConfig();
  const governorAddress = daoConfig?.contracts?.governor as Address;
  const timeLockAddress = daoConfig?.contracts?.timeLock as Address;

  // Get clock mode and block time for conversion
  const { isBlockNumberMode, isClockModeLoading } = useClockModeContext();
  const averageBlockTime = useBlockInterval(); // Get from BlockContext

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
      retry: 3,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000, 
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true, 
      enabled: Boolean(governorAddress) && Boolean(daoConfig?.chain?.id),
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

    // Convert blocknumber values to seconds if needed (only if clock mode is determined)
    const fallbackBlockTime = 12; // Default Ethereum block time
    const blockTime = averageBlockTime || fallbackBlockTime;
    const shouldConvert = !isClockModeLoading && isBlockNumberMode;

    const votingDelayInSeconds = shouldConvert
      ? Number(votingDelay) * blockTime
      : Number(votingDelay);

    const votingPeriodInSeconds = shouldConvert
      ? Number(votingPeriod) * blockTime
      : Number(votingPeriod);
    // TimeLock delay is always in seconds (not affected by clock mode)

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
  }, [data, isBlockNumberMode, isClockModeLoading, averageBlockTime]);

  return {
    data: formattedData,
    isLoading: isLoading || isClockModeLoading,
    isFetching: isFetching || isClockModeLoading,
    error: error as Error | null,
  };
}

export function useQuorum() {
  const daoConfig = useDaoConfig();
  const governorAddress = daoConfig?.contracts?.governor as Address;

  // Use the dedicated clock mode hook
  const {
    isBlockNumberMode,
    rawClockMode,
    isClockModeLoading,
    clockModeError,
  } = useClockModeContext();

  // Get current block number from BlockContext
  const { data: blockNumber } = useBlockNumber({
    chainId: daoConfig?.chain?.id,
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
      enabled: Boolean(governorAddress) && Boolean(daoConfig?.chain?.id),
      staleTime: 0,
    },
  });

  // Determine the correct parameter for quorum function based on clock mode
  // Use a slightly older block for stability (current block - 10)
  const stableBlockNumber = blockNumber ? blockNumber - BigInt(10) : BigInt(0);
  const quorumParameter: bigint = isBlockNumberMode
    ? stableBlockNumber
    : BigInt(clockData ?? 0);

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
      enabled:
        Boolean(governorAddress) &&
        Boolean(daoConfig?.chain?.id) &&
        !isClockModeLoading &&
        (isBlockNumberMode
          ? Boolean(blockNumber && blockNumber > BigInt(10))
          : Boolean(clockData)),
    },
  });

  return {
    quorum: quorumData as bigint | undefined,
    clockData: clockData as bigint | undefined,
    clockMode: rawClockMode,
    isBlocknumberMode: isBlockNumberMode,
    isLoading: isClockLoading || isQuorumLoading || isClockModeLoading,
    isFetching: isClockFetching || isQuorumFetching,
    error: quorumError || clockModeError,
    refetchClock,
  };
}

export function useGovernanceParams() {
  const staticParams = useStaticGovernanceParams();
  const {
    quorum,
    clockMode,
    isBlocknumberMode,
    isLoading: isQuorumLoading,
    isFetching: isQuorumFetching,
    error: quorumError,
    refetchClock,
  } = useQuorum();

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
  };
}
