import { isNil } from "lodash-es";

import { formatBigIntForDisplay } from "@/utils/number";

import { useGovernanceToken } from "./useGovernanceToken";
import { useCurrentVotingPower } from "./useSmartGetVotes";

import type { Address } from "viem";

export function useAddressVotes(address: Address) {
  const { data: tokenData, isLoading: isTokenLoading } = useGovernanceToken();

  const {
    data: votes,
    isLoading: isVotesLoading,
    error,
    refetch,
  } = useCurrentVotingPower(address);

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
