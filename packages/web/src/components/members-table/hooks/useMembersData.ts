import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { isAddress, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { mainnet } from "wagmi/chains";

import { DEFAULT_PAGE_SIZE } from "@/config/base";
import { useAiBotAddress } from "@/hooks/useAiBotAddress";
import { useBatchProfiles } from "@/hooks/useBatchProfiles";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { normalizeAddress } from "@/hooks/useProfileQuery";
import { contributorService } from "@/services/graphql";
import type { ContributorItem } from "@/services/graphql/types";

type PageParam = {
  offset: number;
  limit: number;
};

export function useMembersData(
  pageSize = DEFAULT_PAGE_SIZE,
  searchTerm = "",
  initialPageSize = pageSize,
  orderBy?: string,
  includeBotInQuery = false
) {
  const DEFAULT_ORDER_BY = "lastVoteTimestamp_DESC_NULLS_LAST";
  const daoConfig = useDaoConfig();
  const { botAddress } = useAiBotAddress();
  const isSearching = searchTerm.trim().length > 0;
  const normalizedInitialPageSize = Math.max(pageSize, initialPageSize);
  const publicClient = usePublicClient({ chainId: mainnet.id });

  const resolveSearchAddress = useCallback(
    async (rawTerm: string): Promise<Address | undefined> => {
      const trimmedTerm = rawTerm.trim();
      if (!trimmedTerm) return undefined;

      const normalizedTerm = trimmedTerm.toLowerCase();
      if (isAddress(normalizedTerm)) {
        return normalizedTerm as Address;
      }

      if (!publicClient || !trimmedTerm.includes(".")) return undefined;

      try {
        const ensAddress = await publicClient.getEnsAddress({
          name: trimmedTerm,
        });

        return ensAddress ? (ensAddress.toLowerCase() as Address) : undefined;
      } catch {
        return undefined;
      }
    },
    [publicClient]
  );

  const membersQuery = useInfiniteQuery({
    queryKey: [
      "members",
      pageSize,
      daoConfig?.indexer?.endpoint,
      botAddress,
      searchTerm,
      isSearching,
      normalizedInitialPageSize,
      orderBy ?? DEFAULT_ORDER_BY,
      DEFAULT_ORDER_BY,
      includeBotInQuery,
    ],
    queryFn: async ({ pageParam }) => {
      const { offset, limit } = (pageParam as PageParam) ?? {
        offset: 0,
        limit: normalizedInitialPageSize,
      };
      // If searching, use exact match or return empty result for non-matches
      if (isSearching) {
        const resolvedAddress = await resolveSearchAddress(searchTerm);
        if (!resolvedAddress) {
          return [];
        }

        // For exact address match, search with id_eq
        const result = await contributorService.getAllContributors(
          daoConfig?.indexer?.endpoint ?? "",
          {
            limit: 1,
            offset: 0,
            orderBy,
            where: {
              id_eq: resolvedAddress,
            },
          }
        );
        return result;
      }

      // Normal pagination when not searching
      const effectiveOrderBy = orderBy ?? DEFAULT_ORDER_BY;
      const shouldIncludeBot = includeBotInQuery;
      const result = await contributorService.getAllContributors(
        daoConfig?.indexer?.endpoint ?? "",
        {
          limit,
          offset,
          orderBy: effectiveOrderBy,
          where: shouldIncludeBot
            ? {}
            : {
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
    retryDelay: 2000,
    retry: 3,
    enabled: !!daoConfig?.indexer?.endpoint,
    refetchOnMount: "always",
  });

  const flattenedData = useMemo<ContributorItem[]>(() => {
    if (!membersQuery.data) return [];
    const allMembers = new Map();
    if (!Array.isArray(membersQuery.data?.pages)) {
      return [];
    }
    membersQuery?.data?.pages?.forEach((page) => {
      if (!Array.isArray(page)) {
        return;
      }
      page.forEach((member) => {
                  const normalizedId = member.id.toLowerCase();
                  if (!allMembers.has(normalizedId)) {
                    allMembers.set(normalizedId, member);        }
      });
    });

    return Array.from(allMembers.values());
  }, [membersQuery.data]);

  const normalizedMemberAddresses = useMemo(
    () =>
      flattenedData
        ?.map((member) => normalizeAddress(member.id))
        .sort((a, b) => a.localeCompare(b)) ?? [],
    [flattenedData]
  );

  const { data: profilePullData, isLoading: isProfilePullLoading } = useBatchProfiles(
    normalizedMemberAddresses,
    {
      queryKeyPrefix: ["profilePull", "members"],
      enabled: !!normalizedMemberAddresses.length,
    }
  );

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
    isProfilePullLoading,
    profilePullData,
    loadMoreData,
    refreshData,
  };
}
