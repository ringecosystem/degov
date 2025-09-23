import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { DEFAULT_PAGE_SIZE } from "@/config/base";
import { useAiBotAddress } from "@/hooks/useAiBotAddress";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { contributorService, memberService } from "@/services/graphql";
import type { ContributorItem, Member } from "@/services/graphql/types";

type PageParam = {
  offset: number;
  limit: number;
};

export function useMembersData(
  pageSize = DEFAULT_PAGE_SIZE,
  searchTerm = "",
  initialPageSize = pageSize
) {
  const daoConfig = useDaoConfig();
  const { botAddress } = useAiBotAddress();
  const isSearching = searchTerm.trim().length > 0;
  const normalizedInitialPageSize = Math.max(pageSize, initialPageSize);

  const membersQuery = useInfiniteQuery({
    queryKey: [
      "members",
      pageSize,
      daoConfig?.indexer?.endpoint,
      botAddress,
      searchTerm,
      isSearching,
      normalizedInitialPageSize,
    ],
    queryFn: async ({ pageParam }) => {
      const { offset, limit } = (pageParam as PageParam) ?? {
        offset: 0,
        limit: normalizedInitialPageSize,
      };
      // If searching, use exact match or return empty result for non-matches
      if (isSearching) {
        // For exact address match, search with id_eq
        const result = await contributorService.getAllContributors(
          daoConfig?.indexer?.endpoint ?? "",
          {
            limit: 1,
            offset: 0,
            where: {
              id_eq: searchTerm ? searchTerm?.toLowerCase()?.trim() : undefined,
            },
          }
        );
        return result;
      }

      // Normal pagination when not searching
      const result = await contributorService.getAllContributors(
        daoConfig?.indexer?.endpoint ?? "",
        {
          limit,
          offset,
          where: {
            id_not_eq: botAddress,
          },
        }
      );

      return result;
    },
    initialPageParam: {
      offset: 0,
      limit: normalizedInitialPageSize,
    } as PageParam,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      // If searching, no pagination
      if (isSearching) {
        return undefined;
      }

      // If no data or less than page size, no more pages
      const lastParam = (lastPageParam as PageParam) ?? {
        offset: 0,
        limit: normalizedInitialPageSize,
      };

      if (!lastPage || lastPage.length < lastParam.limit) {
        return undefined;
      }
      // Return next page number
      return {
        offset: lastParam.offset + lastPage.length,
        limit: pageSize,
      } satisfies PageParam;
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
