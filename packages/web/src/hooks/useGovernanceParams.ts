import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";

import { abi as governorAbi } from "@/config/abi/governor";
import { abi as timeLockAbi } from "@/config/abi/timeLock";

import { useDaoConfig } from "./useDaoConfig";

import type { Address } from "viem";

interface StaticGovernanceParams {
  proposalThreshold: bigint;
  votingDelay: bigint;
  votingPeriod: bigint;
  timeLockDelay: bigint;
}

interface GovernanceParams extends StaticGovernanceParams {
  quorum: bigint;
}

export function useStaticGovernanceParams() {
  const daoConfig = useDaoConfig();
  const governorAddress = daoConfig?.contracts?.governor as Address;
  const timeLockAddress = daoConfig?.contracts?.timeLock as Address;

  const { data, isLoading, error, isFetching } = useReadContracts({
    contracts: [
      {
        address: governorAddress as `0x${string}`,
        abi: governorAbi,
        functionName: "proposalThreshold" as const,
        chainId: daoConfig?.chain?.id,
      },
      {
        address: governorAddress as `0x${string}`,
        abi: governorAbi,
        functionName: "votingDelay" as const,
        chainId: daoConfig?.chain?.id,
      },
      {
        address: governorAddress as `0x${string}`,
        abi: governorAbi,
        functionName: "votingPeriod" as const,
        chainId: daoConfig?.chain?.id,
      },
      {
        address: timeLockAddress as `0x${string}`,
        abi: timeLockAbi,
        functionName: "getMinDelay" as const,
        chainId: daoConfig?.chain?.id,
      },
    ],
    query: {
      retry: false,
      staleTime: 24 * 60 * 60 * 1000,
      enabled: Boolean(governorAddress) && Boolean(daoConfig?.chain?.id),
    },
  });

  const formattedData: StaticGovernanceParams | null = data
    ? {
        proposalThreshold: data[0]?.result as bigint,
        votingDelay: data[1]?.result as bigint,
        votingPeriod: data[2]?.result as bigint,
        timeLockDelay: data[3]?.result as bigint,
      }
    : null;

  return {
    data: formattedData,
    isLoading,
    isFetching,
    error: error as Error | null,
  };
}

export function useQuorum() {
  const daoConfig = useDaoConfig();
  const governorAddress = daoConfig?.contracts?.governor as Address;

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

  const {
    data: quorumData,
    isLoading: isQuorumLoading,
    error: quorumError,
    isFetching: isQuorumFetching,
  } = useReadContract({
    address: governorAddress as `0x${string}`,
    abi: governorAbi,
    functionName: "quorum" as const,
    args: [clockData ? BigInt(clockData) : BigInt(0)],
    chainId: daoConfig?.chain?.id,
    query: {
      enabled:
        Boolean(governorAddress) &&
        Boolean(clockData) &&
        Boolean(daoConfig?.chain?.id),
    },
  });

  return {
    quorum: quorumData as bigint | undefined,
    clockData: clockData as bigint | undefined,
    isLoading: isClockLoading || isQuorumLoading,
    isFetching: isClockFetching || isQuorumFetching,
    error: quorumError as Error | null,
    refetchClock,
  };
}

export function useGovernanceParams() {
  const staticParams = useStaticGovernanceParams();
  const {
    quorum,
    isLoading: isQuorumLoading,
    isFetching: isQuorumFetching,
    error: quorumError,
    refetchClock,
  } = useQuorum();

  const formattedData: GovernanceParams | null = useMemo(() => {
    return {
      proposalThreshold: staticParams.data?.proposalThreshold ?? 0n,
      votingDelay: staticParams.data?.votingDelay ?? 0n,
      votingPeriod: staticParams.data?.votingPeriod ?? 0n,
      timeLockDelay: staticParams.data?.timeLockDelay ?? 0n,
      quorum: quorum ?? 0n,
    };
  }, [staticParams.data, quorum]);

  return {
    data: formattedData,
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
