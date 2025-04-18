import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { DEFAULT_PAGE_SIZE } from "@/config/base";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { delegateService } from "@/services/graphql";

import type { Address } from "viem";

export function useDelegationData(address?: Address) {
  const daoConfig = useDaoConfig();

  // Use useInfiniteQuery for pagination
  const {
    data,
    hasNextPage,
    isPending,
    isFetchingNextPage,
    error,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["delegates", daoConfig?.indexer?.endpoint, address],
    queryFn: async ({ pageParam }) => {
      const result = await delegateService.getAllDelegates(
        daoConfig?.indexer?.endpoint as string,
        {
          limit: DEFAULT_PAGE_SIZE,
          offset: pageParam * DEFAULT_PAGE_SIZE,
          orderBy: "blockTimestamp_DESC_NULLS_LAST",
          where: address
            ? { toDelegate_eq: address?.toLowerCase() }
            : undefined,
        }
      );

      return result;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages, lastPageParam) => {
      // If no data or less than page size, no more pages
      if (!lastPage || lastPage.length < DEFAULT_PAGE_SIZE) {
        return undefined;
      }
      // Return next page number
      return lastPageParam + 1;
    },
    enabled: !!daoConfig?.indexer?.endpoint,
    retryDelay: 10_000,
    retry: 3,
  });

  // Flatten all pages into a single array
  const flattenedData = useMemo(() => {
    return data?.pages.flat() || [];
  }, [data]);

  // Load more data function
  const loadMoreData = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);

  // Refresh data function
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
    loadMoreData,
    refreshData,
  };
}
