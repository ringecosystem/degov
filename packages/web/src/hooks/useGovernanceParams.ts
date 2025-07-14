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
  timeLockDelay?: bigint;
}

interface GovernanceParams extends StaticGovernanceParams {
  quorum: bigint;
}

export function useStaticGovernanceParams() {
  const daoConfig = useDaoConfig();
  const governorAddress = daoConfig?.contracts?.governor as Address;
  const timeLockAddress = daoConfig?.contracts?.timeLock as Address;

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
        // @ts-expect-error wagmi type constraint
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
      retry: false,
      staleTime: 24 * 60 * 60 * 1000,
      enabled: Boolean(governorAddress) && Boolean(daoConfig?.chain?.id),
    },
  });

  const formattedData: StaticGovernanceParams | null = useMemo(() => {
    if (!data) return null;

    const result: StaticGovernanceParams = {
      proposalThreshold: data[0]?.result as bigint,
      votingDelay: data[1]?.result as bigint,
      votingPeriod: data[2]?.result as bigint,
    };

    if (timeLockAddress && data.length > 3) {
      result.timeLockDelay = data[3]?.result as bigint;
    }

    return result;
  }, [data, timeLockAddress]);

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
      timeLockDelay: staticParams.data?.timeLockDelay,
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
