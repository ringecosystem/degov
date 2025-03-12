import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useReadContracts } from "wagmi";

import { abi as GovernorAbi } from "@/config/abi/governor";
import { DEFAULT_PAGE_SIZE } from "@/config/base";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { proposalService } from "@/services/graphql";
import type { ProposalState as ProposalStatus } from "@/types/proposal";

import type { Address } from "viem";
export type ProposalVotes = {
  againstVotes: bigint;
  forVotes: bigint;
  abstainVotes: bigint;
};

export function useProposalData(address?: Address, support?: "1" | "2" | "3") {
  const daoConfig = useDaoConfig();

  const proposalsQuery = useInfiniteQuery({
    queryKey: ["proposals", daoConfig?.indexer?.endpoint, address, support],
    queryFn: async ({ pageParam }) => {
      let whereCondition = {};

      if (address && !support) {
        whereCondition = {
          proposer_eq: address?.toLowerCase(),
          OR: {
            voters_every: {
              voter_eq: address?.toLowerCase(),
            },
          },
        };
      } else if (address && support) {
        whereCondition = {
          proposer_eq: address?.toLowerCase(),
          AND: {
            voters_every: {
              voter_eq: address?.toLowerCase(),
              support_eq: support ? parseInt(support) : undefined,
            },
          },
        };
      }

      const result = await proposalService.getAllProposals(
        daoConfig?.indexer?.endpoint as string,
        {
          limit: DEFAULT_PAGE_SIZE,
          offset: pageParam * DEFAULT_PAGE_SIZE,
          orderBy: "blockTimestamp_DESC_NULLS_LAST",
          where: whereCondition,
        }
      );

      return result;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages, lastPageParam) => {
      if (!lastPage || lastPage.length < DEFAULT_PAGE_SIZE) {
        return undefined;
      }
      return lastPageParam + 1;
    },
    enabled: !!daoConfig?.indexer?.endpoint,
    retryDelay: 10_000,
    retry: 3,
  });

  const flattenedData = useMemo(() => {
    return proposalsQuery.data?.pages.flat() || [];
  }, [proposalsQuery.data]);

  const voteContracts = useMemo(() => {
    const proposalVotesContract = {
      address: daoConfig?.contracts?.governor as `0x${string}`,
      abi: GovernorAbi,
      functionName: "proposalVotes",
      chainId: daoConfig?.chain?.id,
    } as const;

    return flattenedData.map((item) => ({
      ...proposalVotesContract,
      args: [item.proposalId],
    }));
  }, [flattenedData, daoConfig?.contracts?.governor, daoConfig?.chain?.id]);

  const {
    data: proposalVotes,
    isFetching: proposalVotesLoading,
    error: proposalVotesError,
  } = useReadContracts({
    contracts: voteContracts,
    query: {
      enabled: flattenedData.length > 0 && !!daoConfig?.chain?.id,
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  });

  const statusContracts = useMemo(() => {
    const proposalStatusContract = {
      address: daoConfig?.contracts?.governor as `0x${string}`,
      abi: GovernorAbi,
      functionName: "state",
      chainId: daoConfig?.chain?.id,
    } as const;

    return flattenedData.map((item) => ({
      ...proposalStatusContract,
      args: [item.proposalId],
    }));
  }, [flattenedData, daoConfig?.contracts?.governor, daoConfig?.chain?.id]);

  const {
    data: proposalStatuses,
    isFetching: proposalStatusesLoading,
    error: proposalStatusesError,
  } = useReadContracts({
    contracts: statusContracts,
    query: {
      enabled: flattenedData.length > 0 && !!daoConfig?.chain?.id,
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  });

  const formattedVotes = useMemo(
    () =>
      flattenedData.reduce((acc, proposal, index) => {
        if (proposalVotes?.[index]?.result) {
          acc[proposal.id] = {
            againstVotes: proposalVotes?.[index].result?.[0] ?? BigInt(0),
            forVotes: proposalVotes?.[index].result?.[1] ?? BigInt(0),
            abstainVotes: proposalVotes?.[index].result?.[2] ?? BigInt(0),
          };
        }
        return acc;
      }, {} as Record<string, ProposalVotes>),
    [flattenedData, proposalVotes]
  );

  const formattedStatuses = useMemo(
    () =>
      proposalStatuses
        ? flattenedData.reduce((acc, proposal, index) => {
            if (proposalStatuses[index]?.status === "success") {
              acc[proposal.id] = proposalStatuses[index]
                .result as ProposalStatus;
            }
            return acc;
          }, {} as Record<string, ProposalStatus>)
        : {},
    [flattenedData, proposalStatuses]
  );

  const loadMoreData = useCallback(() => {
    if (!proposalsQuery.isFetchingNextPage && proposalsQuery.hasNextPage) {
      proposalsQuery.fetchNextPage();
    }
  }, [proposalsQuery]);

  const refreshData = useCallback(() => {
    proposalsQuery.refetch();
  }, [proposalsQuery]);

  return {
    state: {
      data: flattenedData,
      hasNextPage: proposalsQuery.hasNextPage,
      isPending: proposalsQuery.isPending,
      isFetchingNextPage: proposalsQuery.isFetchingNextPage,
      error: proposalsQuery.error,
    },
    proposalVotesState: {
      data: formattedVotes,
      isFetching: proposalVotesLoading,
      error: proposalVotesError,
    },
    proposalStatusState: {
      data: formattedStatuses,
      isFetching: proposalStatusesLoading,
      error: proposalStatusesError,
    },
    loadMoreData,
    refreshData,
  };
}
