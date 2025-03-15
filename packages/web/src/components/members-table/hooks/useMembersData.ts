import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { DEFAULT_PAGE_SIZE } from "@/config/base";
import { useMembersVotingPower } from "@/hooks/useMembersVotingPower";
import { memberService } from "@/services/graphql";

export function useMembersData(pageSize = DEFAULT_PAGE_SIZE) {
  const membersQuery = useInfiniteQuery({
    queryKey: ["members", pageSize],
    queryFn: async ({ pageParam }) => {
      const result = await memberService.getMembers(pageParam, pageSize);

      return result;
    },
    initialPageParam: new Date().toISOString(),
    getNextPageParam: (lastPage) => {
      if (!lastPage?.data || lastPage.data.length === 0) {
        return undefined;
      }

      if (lastPage.data.length < pageSize) {
        return undefined;
      }

      const lastItem = lastPage.data[lastPage.data.length - 1];
      if (!lastItem?.ctime) {
        return undefined;
      }

      return lastItem.ctime;
    },
    retryDelay: 10_000,
    retry: 3,
  });

  const flattenedData = useMemo(() => {
    if (!membersQuery.data) return [];

    const allMembers = new Map();

    membersQuery.data.pages.forEach((page) => {
      if (page?.data) {
        page.data.forEach((member) => {
          if (!allMembers.has(member.id)) {
            allMembers.set(member.id, member);
          }
        });
      }
    });

    return Array.from(allMembers.values());
  }, [membersQuery.data]);

  const { votingPowerMap, isLoading: isVotingPowerLoading } =
    useMembersVotingPower(flattenedData);

  const sortedMembers = useMemo(() => {
    if (flattenedData.length === 0) return [];

    return [...flattenedData].sort((a, b) => {
      const aVotingPower = votingPowerMap[a.address.toLowerCase()]?.raw || 0n;
      const bVotingPower = votingPowerMap[b.address.toLowerCase()]?.raw || 0n;

      if (bVotingPower > aVotingPower) return 1;
      if (bVotingPower < aVotingPower) return -1;
      return 0;
    });
  }, [flattenedData, votingPowerMap]);

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
      data: sortedMembers,
      hasNextPage: membersQuery.hasNextPage,
      isPending: membersQuery.isPending,
      isFetchingNextPage: membersQuery.isFetchingNextPage,
      error: membersQuery.error,
    },
    votingPowerState: {
      data: votingPowerMap,
      isLoading: isVotingPowerLoading,
    },
    loadMoreData,
    refreshData,
  };
}
