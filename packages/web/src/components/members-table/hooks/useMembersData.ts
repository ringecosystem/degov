import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { isAddress, type Address } from "viem";

import { DEFAULT_PAGE_SIZE } from "@/config/base";
import { useAiBotAddress } from "@/hooks/useAiBotAddress";
import { useBatchEnsRecords } from "@/hooks/useBatchEnsRecords";
import { useBatchProfiles } from "@/hooks/useBatchProfiles";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { normalizeAddress } from "@/hooks/useProfileQuery";
import {
  buildGovernanceScope,
  contributorService,
  ensService,
} from "@/services/graphql";
import type { ContributorItem } from "@/services/graphql/types";

import { DEFAULT_ORDER_BY } from "../types";

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
  const daoConfig = useDaoConfig();
  const { botAddress } = useAiBotAddress();
  const isSearching = searchTerm.trim().length > 0;
  const normalizedInitialPageSize = Math.max(pageSize, initialPageSize);
  const governanceScope = useMemo(
    () => buildGovernanceScope(daoConfig),
    [daoConfig]
  );

  const resolveSearchAddress = useCallback(
    async (rawTerm: string): Promise<Address | undefined> => {
      const trimmedTerm = rawTerm.trim();
      if (!trimmedTerm) return undefined;

      const normalizedTerm = trimmedTerm.toLowerCase();
      if (isAddress(normalizedTerm)) {
        return normalizedTerm as Address;
      }

      if (!trimmedTerm.includes(".")) return undefined;

      try {
        const ensRecord = await ensService.getEnsRecord({
          name: trimmedTerm,
          daoCode: daoConfig?.code,
        });
        const ensAddress = ensRecord?.address;

        return ensAddress ? (ensAddress.toLowerCase() as Address) : undefined;
      } catch {
        return undefined;
      }
    },
    [daoConfig]
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
      governanceScope,
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
              ...governanceScope,
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
            ? governanceScope
            : {
                ...governanceScope,
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
          allMembers.set(normalizedId, member);
        }
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

  const { data: profilePullData, isLoading: isProfilePullLoading } =
    useBatchProfiles(normalizedMemberAddresses, {
      queryKeyPrefix: ["profilePull", "members"],
      enabled: !!normalizedMemberAddresses.length,
    });

  useBatchEnsRecords(normalizedMemberAddresses, {
    queryKeyPrefix: ["ensRecords", "members"],
    enabled: !!normalizedMemberAddresses.length,
  });

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
