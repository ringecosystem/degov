import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { DEFAULT_PAGE_SIZE } from "@/config/base";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { contributorService, memberService } from "@/services/graphql";
import type { ContributorItem, Member } from "@/services/graphql/types";

export function useMembersData(pageSize = DEFAULT_PAGE_SIZE) {
  const daoConfig = useDaoConfig();
  const membersQuery = useInfiniteQuery({
    queryKey: ["members", pageSize, daoConfig?.indexer?.endpoint],
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
      return lastPageParam + pageSize;
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
      daoConfig?.indexer?.endpoint,
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
      const profilePull = Array.isArray(profilePullData?.data)
        ? profilePullData?.data?.find((item) => item.address === member.id)
        : undefined;
      obj[member.id] = profilePull;
    });
    return obj;
  }, [flattenedData, profilePullData]);

  const { isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    membersQuery;

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
      hasNextPage: membersQuery.hasNextPage,
      isPending: membersQuery.isPending,
      isFetchingNextPage,
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
