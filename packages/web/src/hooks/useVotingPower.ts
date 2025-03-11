import { useReadContracts } from "wagmi";

import { abi as tokenAbi } from "@/config/abi/token";

import { useDaoConfig } from "./useDaoConfig";

import type { Address } from "viem";

interface TokenVotingPower {
  totalSupply: bigint;
  votes?: bigint;
}

interface UseVotingPowerReturn {
  data: TokenVotingPower | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch voting power related data
 * @param account - Optional account address to fetch voting power for
 */
export function useVotingPower(account?: Address): UseVotingPowerReturn {
  const daoConfig = useDaoConfig();
  const tokenAddress = daoConfig?.contracts?.governorToken?.address as Address;

  const { data, isLoading, error } = useReadContracts({
    contracts: account
      ? [
          {
            address: tokenAddress,
            abi: tokenAbi,
            functionName: "totalSupply",
            chainId: daoConfig?.chain?.id,
          },
          {
            address: tokenAddress,
            abi: tokenAbi,
            functionName: "getVotes",
            args: [account],
            chainId: daoConfig?.chain?.id,
          },
        ]
      : [
          {
            address: tokenAddress,
            abi: tokenAbi,
            functionName: "totalSupply",
            chainId: daoConfig?.chain?.id,
          },
        ],
    query: {
      enabled: Boolean(tokenAddress) && Boolean(daoConfig?.chain?.id),
      refetchInterval: 60_000, // Refetch every minute
    },
  });

  const formattedData: TokenVotingPower | null = data
    ? {
        totalSupply: data[0]?.result as bigint,
        ...(account ? { votes: data[1]?.result as bigint } : {}),
      }
    : null;

  return {
    data: formattedData,
    isLoading,
    error: error as Error | null,
  };
}
