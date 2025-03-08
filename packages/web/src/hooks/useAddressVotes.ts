import { isNil } from "lodash-es";
import { useReadContract } from "wagmi";

import { abi as tokenAbi } from "@/config/abi/token";
import { formatBigIntForDisplay } from "@/utils/number";

import { useConfig } from "./useConfig";
import { useGovernanceToken } from "./useGovernanceToken";

import type { Address } from "viem";

export function useAddressVotes(address: Address) {
  const daoConfig = useConfig();
  const tokenAddress = daoConfig?.contracts?.governorToken?.contract as Address;
  const { data: tokenData, isLoading: isTokenLoading } = useGovernanceToken();

  const {
    data: votes,
    isLoading: isVotesLoading,
    error,
    refetch,
  } = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "getVotes",
    args: [address!],
    chainId: daoConfig?.network?.chainId,
    query: {
      enabled:
        Boolean(address) &&
        Boolean(tokenAddress) &&
        Boolean(daoConfig?.network?.chainId),
    },
  });
  const formattedVotes =
    !isNil(votes) && !isNil(tokenData?.decimals)
      ? formatBigIntForDisplay(votes, tokenData.decimals ?? 18)
      : undefined;

  return {
    votes,
    formattedVotes,
    isLoading: isVotesLoading || isTokenLoading,
    error,
    refetch,
  };
}
