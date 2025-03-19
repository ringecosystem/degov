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

  const contributorsQuery = useQuery({
    queryKey: [
      "contributors",
      flattenedData?.length,
      flattenedData?.map((member) => member?.address?.toLowerCase()),
    ],
    queryFn: async () => {
      const result = await contributorService.getAllContributors(
        daoConfig?.indexer?.endpoint ?? "",
        {
          limit: flattenedData?.length,
          offset: 0,
          where: {
            id_in: flattenedData?.map((member) =>
              member?.address?.toLowerCase()
            ),
          },
        }
      );

      return result;
    },

    enabled: !!flattenedData?.length,

    retryDelay: 10_000,
    retry: 3,
  });

  const filterData = useMemo(() => {
    if (!flattenedData?.length || !contributorsQuery.data?.length) return {};

    const obj: Record<string, ContributorItem | undefined> = {};
    flattenedData?.forEach((member) => {
      const contributor = contributorsQuery.data?.find(
        (item) => item.id === member.address
      );
      if (member.address) {
        obj[member.address] = contributor;
      }
    });
    return obj;
  }, [flattenedData, contributorsQuery.data]);

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
      isLoading: contributorsQuery.isLoading,
    },
    loadMoreData,
    refreshData,
  };
}
