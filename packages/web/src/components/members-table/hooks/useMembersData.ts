import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { DEFAULT_PAGE_SIZE } from "@/config/base";
import { memberService } from "@/services/graphql";
import type { Member } from "@/services/graphql/types";

export function useMembersData(pageSize = DEFAULT_PAGE_SIZE) {
  const membersQuery = useInfiniteQuery({
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
    if (!membersQuery.data) return [];
    const allMembers = new Map();
    membersQuery?.data?.pages?.forEach((page) => {
      if (page) {
        page?.data?.forEach((member) => {
          if (!allMembers.has(member?.address)) {
            allMembers.set(member.address, member);
          }
        });
      }
    });

    return Array.from(allMembers.values());
  }, [membersQuery.data]);

  const loadMoreData = useCallback(() => {
    if (!membersQuery.isFetchingNextPage && membersQuery.hasNextPage) {
      membersQuery.fetchNextPage();
    }
  }, [membersQuery]);

  const refreshData = useCallback(() => {
    membersQuery.refetch();
  }, [membersQuery]);

  return {
    state: {
      data: flattenedData,
      hasNextPage: membersQuery.hasNextPage,
      isPending: membersQuery.isPending,
      isFetchingNextPage: membersQuery.isFetchingNextPage,
      error: membersQuery.error,
    },

    loadMoreData,
    refreshData,
  };
}
