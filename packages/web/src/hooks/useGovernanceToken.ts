import { useReadContracts } from "wagmi";

import { abi as tokenAbi } from "@/config/abi/token";

import { useDaoConfig } from "./useDaoConfig";

import type { Address } from "viem";

interface GovernanceTokenMetadata {
  symbol: string;
  name: string;
  decimals: number;
}

interface UseGovernanceTokenReturn {
  data: GovernanceTokenMetadata | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch governance token metadata
 * @param tokenAddress - The address of the governance token contract
 */
export function useGovernanceToken(): UseGovernanceTokenReturn {
  const daoConfig = useDaoConfig();
  const standard = daoConfig?.contracts?.governorToken?.standard;
  const tokenAddress = daoConfig?.contracts?.governorToken?.address as Address;
  const { data, isLoading, error } = useReadContracts({
    contracts:
      standard === "ERC20"
        ? [
            {
              address: tokenAddress,
              abi: tokenAbi,
              functionName: "symbol",
              chainId: daoConfig?.chain?.id,
            },
            {
              address: tokenAddress,
              abi: tokenAbi,
              functionName: "name",
              chainId: daoConfig?.chain?.id,
            },
            {
              address: tokenAddress,
              abi: tokenAbi,
              functionName: "decimals",
              chainId: daoConfig?.chain?.id,
            },
          ]
        : [
            {
              address: tokenAddress,
              abi: tokenAbi,
              functionName: "symbol",
              chainId: daoConfig?.chain?.id,
            },
            {
              address: tokenAddress,
              abi: tokenAbi,
              functionName: "name",
              chainId: daoConfig?.chain?.id,
            },
          ],
    query: {
      enabled: Boolean(tokenAddress) && Boolean(daoConfig?.chain?.id),
    },
  });

  const formattedData: GovernanceTokenMetadata | null = data
    ? {
        symbol: data[0].result as string,
        name: data[1].result as string,
        decimals:
          standard === "ERC20"
            ? data?.[2]?.result
              ? Number(data[2].result)
              : 18
            : 0,
      }
    : null;

  return {
    data: formattedData,
    isLoading,
    error: error as Error | null,
  };
}
