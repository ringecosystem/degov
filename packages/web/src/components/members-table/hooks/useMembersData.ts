import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { DEFAULT_PAGE_SIZE } from "@/config/base";
import { memberService } from "@/services/graphql";
import type { Member } from "@/services/graphql/types";

export function useMembersData(pageSize = DEFAULT_PAGE_SIZE) {
  const {
    data,
    hasNextPage,
    isPending,
    isFetchingNextPage,
    error,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["members", pageSize],
    queryFn: async ({ pageParam }) => {
      const result = await memberService.getMembers(pageParam, pageSize);

      return result;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.data || lastPage.data.length === 0) {
        return undefined;
      }

      if (lastPage.data.length < pageSize) {
        return undefined;
      }

      const lastItem = lastPage.data[lastPage.data.length - 1];
      if (!lastItem?.rn) {
        return undefined;
      }

      return lastItem.rn;
    },
    retryDelay: 10_000,
    retry: 3,
  });

  const flattenedData = useMemo<Member[]>(() => {
    if (!data) return [];
    const allMembers = new Map();
    data?.pages?.forEach((page) => {
      if (page) {
        page?.data?.forEach((member) => {
          if (!allMembers.has(member?.address)) {
            allMembers.set(member.address, member);
          }
        });
      }
    });

    return Array.from(allMembers.values());
  }, [data]);

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

    loadMoreData,
    refreshData,
  };
}
