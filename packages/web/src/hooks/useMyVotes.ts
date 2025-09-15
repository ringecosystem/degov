import { isNil } from "lodash-es";
import { useAccount } from "wagmi";

import { formatBigIntForDisplay } from "@/utils/number";

import { useGovernanceParams } from "./useGovernanceParams";
import { useGovernanceToken } from "./useGovernanceToken";
import { useCurrentVotingPower } from "./useSmartGetVotes";

import type { Address } from "viem";

interface UseVotesReturn {
  votes?: bigint;
  formattedVotes?: string;
  proposalThreshold?: bigint;
  formattedProposalThreshold?: string;
  hasEnoughVotes: boolean;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useMyVotes(): UseVotesReturn {
  const { address } = useAccount();
  const { data: tokenData, isLoading: isTokenLoading } = useGovernanceToken();
  const { data: governanceParams, isLoading: isParamsLoading } =
    useGovernanceParams();

  const {
    data: votes,
    isLoading: isVotesLoading,
    error,
    refetch,
  } = useCurrentVotingPower(address as Address);

  const formattedVotes =
    !isNil(votes) && !isNil(tokenData?.decimals)
      ? formatBigIntForDisplay(votes, tokenData.decimals ?? 18)
      : undefined;

  const hasEnoughVotes =
    votes && governanceParams?.proposalThreshold
      ? votes >= governanceParams.proposalThreshold
      : false;

  return {
    votes,
    formattedVotes,
    proposalThreshold: governanceParams?.proposalThreshold,
    formattedProposalThreshold: governanceParams?.proposalThreshold
      ? formatBigIntForDisplay(
          governanceParams.proposalThreshold,
          tokenData?.decimals ?? 18
        )
      : undefined,
    hasEnoughVotes,
    refetch,
    isLoading: isVotesLoading || isTokenLoading || isParamsLoading,
    isFetching: isVotesLoading,
    error,
  };
}
