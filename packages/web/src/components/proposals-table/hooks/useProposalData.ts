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

export function useProposalData(
  address?: Address,
  support?: "1" | "2" | "3",
  pageSize: number = DEFAULT_PAGE_SIZE
) {
  const daoConfig = useDaoConfig();

  const {
    data,
    hasNextPage,
    isPending,
    isFetchingNextPage,
    error,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: [
      "proposals",
      daoConfig?.indexer?.endpoint,
      address,
      support,
      pageSize,
    ],
    queryFn: async ({ pageParam }) => {
      let whereCondition = {};

      if (address && !support) {
        whereCondition = {
          proposer_eq: address?.toLowerCase(),
          OR: {
            voters_some: {
              voter_eq: address?.toLowerCase(),
            },
          },
        };
      } else if (address && support) {
        whereCondition = {
          voters_some: {
            voter_eq: address?.toLowerCase(),
            support_eq: support ? parseInt(support) : undefined,
          },
        };
      }

      const result = await proposalService.getAllProposals(
        daoConfig?.indexer?.endpoint as string,
        {
          limit: pageSize,
          offset: pageParam * pageSize,
          orderBy: "blockTimestamp_DESC_NULLS_LAST",
          where: whereCondition,
        }
      );

      return result;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages, lastPageParam) => {
      if (!lastPage || lastPage.length < pageSize) {
        return undefined;
      }
      return lastPageParam + 1;
    },
    enabled: !!daoConfig?.indexer?.endpoint,
    retryDelay: 10_000,
    retry: 3,
  });

  const flattenedData = useMemo(() => {
    return data?.pages.flat() || [];
  }, [data]);

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
    if (!isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);

  const refreshData = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    state: {
      data: flattenedData,
      hasNextPage,
      isPending,
      isFetchingNextPage,
      error,
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
