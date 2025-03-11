import { isNil } from "lodash-es";
import { useReadContract } from "wagmi";

import { abi as tokenAbi } from "@/config/abi/token";
import { formatBigIntForDisplay } from "@/utils/number";

import { useDaoConfig } from "./useDaoConfig";
import { useGovernanceToken } from "./useGovernanceToken";

import type { Address } from "viem";

export function useAddressVotes(address: Address) {
  const daoConfig = useDaoConfig();
  const tokenAddress = daoConfig?.contracts?.governorToken?.address as Address;
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
    chainId: daoConfig?.chain?.id,
    query: {
      enabled:
        Boolean(address) &&
        Boolean(tokenAddress) &&
        Boolean(daoConfig?.chain?.id),
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
