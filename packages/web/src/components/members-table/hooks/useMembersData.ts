import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { DEFAULT_PAGE_SIZE } from "@/config/base";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { contributorService, memberService } from "@/services/graphql";
import type { ContributorItem, Member } from "@/services/graphql/types";

export function useMembersData(pageSize = DEFAULT_PAGE_SIZE) {
  const daoConfig = useDaoConfig();
  const membersQuery = useInfiniteQuery({
    queryKey: ["members", pageSize],
    queryFn: async ({ pageParam }) => {
      const result = await contributorService.getAllContributors(
        daoConfig?.indexer?.endpoint ?? "",
        {
          limit: pageSize,
          offset: Number(pageParam),
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
    retryDelay: 10_000,
    retry: 3,
  });

  const flattenedData = useMemo<ContributorItem[]>(() => {
    if (!membersQuery.data) return [];
    const allMembers = new Map();
    if (!Array.isArray(membersQuery.data?.pages)) {
      return [];
    }
    membersQuery?.data?.pages?.forEach((page) => {
      if (page) {
        page?.forEach((member) => {
          if (!allMembers.has(member.id)) {
            allMembers.set(member.id, member);
          }
        });
      }
    });

    return Array.from(allMembers.values());
  }, [membersQuery.data]);

  const { data: profilePullData, isLoading: isProfilePullLoading } = useQuery({
    queryKey: [
      "profilePull",
      flattenedData?.map((member) => member.id?.toLowerCase()),
    ],
    queryFn: () =>
      memberService.getProfilePull(
        flattenedData?.map((member) => member.id?.toLowerCase())
      ),
    enabled: !!flattenedData?.length,
  });

  const filterData = useMemo(() => {
    if (!flattenedData?.length || !profilePullData?.data?.length) return {};

    const obj: Record<string, Member | undefined> = {};
    flattenedData?.forEach((member) => {
      const profilePull = profilePullData?.data?.find(
        (item) => item.address === member.id
      );
      obj[member.id] = profilePull;
    });
    return obj;
  }, [flattenedData, profilePullData]);

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
    profilePullState: {
      data: filterData,
      isLoading: isProfilePullLoading,
    },
    loadMoreData,
    refreshData,
  };
}
