import { useReadContract, useReadContracts } from "wagmi";

import { abi as governorAbi } from "@/config/abi/governor";
import { abi as timeLockAbi } from "@/config/abi/timeLock";

import { useDaoConfig } from "./useDaoConfig";

import type { Address } from "viem";

interface GovernanceParams {
  proposalThreshold: bigint;
  quorum: bigint;
  votingDelay: bigint;
  votingPeriod: bigint;
  timeLockDelay: bigint;
}

export function useGovernanceParams() {
  const daoConfig = useDaoConfig();
  const governorAddress = daoConfig?.contracts?.governor as Address;
  const timeLockAddress = daoConfig?.contracts?.timeLock as Address;

  const { data: clockData, isLoading: isClockLoading } = useReadContract({
    address: governorAddress as `0x${string}`,
    abi: governorAbi,
    functionName: "clock" as const,
    chainId: daoConfig?.chain?.id,
    query: {
      enabled: Boolean(governorAddress) && Boolean(daoConfig?.chain?.id),
      staleTime: 0,
    },
  });

  const { data, isLoading, error } = useReadContracts({
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
        functionName: "quorum" as const,
        args: [clockData ? BigInt(clockData) : BigInt(0)],
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
      enabled:
        Boolean(governorAddress) &&
        Boolean(clockData) &&
        Boolean(daoConfig?.chain?.id),
    },
  });

  const formattedData: GovernanceParams | null = data
    ? {
        proposalThreshold: data[0]?.result as bigint,
        quorum: data[1]?.result as bigint,
        votingDelay: data[2]?.result as bigint,
        votingPeriod: data[3]?.result as bigint,
        timeLockDelay: data[4]?.result as bigint,
      }
    : null;

  return {
    data: formattedData,
    isLoading: isLoading || isClockLoading,
    error: error as Error | null,
  };
}
