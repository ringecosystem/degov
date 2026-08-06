import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useAccount, useReadContracts } from "wagmi";

import { abi as GovernorAbi } from "@/config/abi/governor";
import { DEFAULT_MULTICALL_BATCH_SIZE, DEFAULT_PAGE_SIZE } from "@/config/base";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import {
  buildProposalInfiniteInitialData,
  buildProposalListQueryKey,
  fetchProposalListPage,
  getProposalNextPageParam,
  normalizeProposalInitialPageSize,
  shouldUseProposalInitialPage,
  type InitialProposalPage,
  type ProposalPageParam,
  type SupportFilter,
} from "@/lib/proposal-directory-query";
import { hasProposalDirectoryLoadError } from "@/lib/proposal-directory-state";
import type { ProposalListItem } from "@/services/graphql/types";
import type { ProposalState as ProposalStatus } from "@/types/proposal";

import type { Address } from "viem";
export type { SupportFilter } from "@/lib/proposal-directory-query";
export type ProposalVotes = {
  againstVotes: bigint;
  forVotes: bigint;
  abstainVotes: bigint;
};

export function useProposalData(
  address?: Address,
  support?: SupportFilter,
  pageSize: number = DEFAULT_PAGE_SIZE,
  initialPageSize: number = pageSize,
  initialPage?: InitialProposalPage
) {
  const daoConfig = useDaoConfig();
  const { address: connectedAddress } = useAccount();
  const normalizedInitialPageSize = normalizeProposalInitialPageSize(
    pageSize,
    initialPageSize
  );
  const shouldUseInitialPage = shouldUseProposalInitialPage({
    address,
    support,
    connectedAddress,
    initialPageSize: initialPage?.pageSize,
    normalizedInitialPageSize,
  });

  const {
    data,
    hasNextPage,
    isPending,
    isError,
    isFetchingNextPage,
    dataUpdatedAt,
    error,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery<ProposalListItem[]>({
    queryKey: buildProposalListQueryKey({
      config: daoConfig,
      address,
      support,
      pageSize,
      initialPageSize: normalizedInitialPageSize,
      connectedAddress,
    }),
    queryFn: async ({ pageParam }) => {
      const { offset, limit } = (pageParam as ProposalPageParam) ?? {
        offset: 0,
        limit: normalizedInitialPageSize,
      };

      return fetchProposalListPage({
        config: daoConfig!,
        limit,
        offset,
        address,
        support,
        connectedAddress,
      });
    },
    initialPageParam: {
      offset: 0,
      limit: normalizedInitialPageSize,
    } as ProposalPageParam,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      return getProposalNextPageParam(
        lastPage,
        lastPageParam as ProposalPageParam,
        normalizedInitialPageSize,
        pageSize
      );
    },
    enabled: !!daoConfig?.indexer?.endpoint,
    initialData: shouldUseInitialPage
      ? buildProposalInfiniteInitialData(initialPage)
      : undefined,
    initialDataUpdatedAt: shouldUseInitialPage ? initialPage?.updatedAt : undefined,
    retryDelay: 10_000,
    retry: 3,
  });

  const flattenedData = useMemo<ProposalListItem[]>(() => {
    return data?.pages.flat() || [];
  }, [data]);

  const directoryLoadFailed = hasProposalDirectoryLoadError({
    isError,
    usesInitialPage: shouldUseInitialPage,
    initialPageFailed: initialPage?.failed ?? false,
    dataUpdatedAt,
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
    isLoading: proposalStatusesLoading,
    error: proposalStatusesError,
  } = useReadContracts({
    contracts: statusContracts,
    batchSize: DEFAULT_MULTICALL_BATCH_SIZE,
    query: {
      enabled: flattenedData.length > 0 && !!daoConfig?.chain?.id,
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
      directoryLoadFailed,
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
