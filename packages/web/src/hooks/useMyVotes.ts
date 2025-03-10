import { isNil } from "lodash-es";
import { useAccount, useReadContract } from "wagmi";

import { abi as tokenAbi } from "@/config/abi/token";
import { formatBigIntForDisplay } from "@/utils/number";

import { useDaoConfig } from "./useDaoConfig";
import { useGovernanceParams } from "./useGovernanceParams";
import { useGovernanceToken } from "./useGovernanceToken";

import type { QueryObserverResult } from "@tanstack/react-query";
import type { Address, ReadContractErrorType } from "viem";

interface UseVotesReturn {
  votes?: bigint;
  formattedVotes?: string;
  proposalThreshold?: bigint;
  formattedProposalThreshold?: string;
  hasEnoughVotes: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<QueryObserverResult<bigint, ReadContractErrorType>>;
}

export function useMyVotes(): UseVotesReturn {
  const { address } = useAccount();
  const daoConfig = useDaoConfig();
  const { data: tokenData, isLoading: isTokenLoading } = useGovernanceToken();
  const { data: governanceParams, isLoading: isParamsLoading } =
    useGovernanceParams();

  const tokenAddress = daoConfig?.contracts?.governorToken?.contract as Address;

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
    error,
  };
}
