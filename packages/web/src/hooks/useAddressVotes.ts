import { useConfig } from "./useConfig";
import { useReadContract } from "wagmi";
import { abi as tokenAbi } from "@/config/abi/token";
import { Address } from "viem";
import { isNil } from "lodash-es";
import { useGovernanceToken } from "./useGovernanceToken";
import { formatBigIntForDisplay } from "@/utils/number";

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
    query: {
      enabled: Boolean(address) && Boolean(tokenAddress),
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
