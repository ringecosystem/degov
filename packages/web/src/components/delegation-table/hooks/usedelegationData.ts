import { useQuery } from "@tanstack/react-query";
import { useState, useCallback, useEffect, useMemo } from "react";


import { useConfig as useDaoConfig } from "@/hooks/useConfig";
import { delegateService } from "@/services/graphql";
import type { DelegateItem } from "@/services/graphql/types";

import type { Address } from "viem";

export function useDelegationData(address: Address) {
  const daoConfig = useDaoConfig();
  const [currentPage, setCurrentPage] = useState(1);
  const [allDelegates, setAllDelegates] = useState<DelegateItem[]>([]);

  const queryKey = useMemo(
    () => ["delegates", daoConfig?.indexer?.endpoint, currentPage],
    [daoConfig?.indexer?.endpoint, currentPage]
  );

  const { refetch, ...proposalsQuery } = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await delegateService.getAllDelegates(
        daoConfig?.indexer?.endpoint as string,
        {
          limit: 10,
          offset: (currentPage - 1) * 10,
          orderBy: "blockTimestamp_DESC_NULLS_LAST",
          where: address
            ? { toDelegate_eq: address?.toLowerCase() }
            : undefined,
        }
      );

      if (Array.isArray(result)) {
        setAllDelegates((prev) => {
          if (currentPage === 1) return result;

          const existingIds = new Set(prev.map((p) => p.id));
          const newDelegates = result.filter((p) => !existingIds.has(p.id));
          return [...prev, ...newDelegates];
        });
        return result;
      }
      return [];
    },
    retryDelay: 10_000,
    retry: 3,
  });

  const loadMoreData = useCallback(() => {
    if (!proposalsQuery.isLoading && proposalsQuery.data?.length === 10) {
      setCurrentPage((prev) => prev + 1);
    }
  }, [proposalsQuery.isLoading, proposalsQuery.data?.length]);

  const refreshData = useCallback(() => {
    setCurrentPage(1);
    setAllDelegates([]);
    refetch();
  }, [refetch]);

  const loadInitialData = useCallback(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
      setAllDelegates([]);
    } else {
      refetch();
    }
  }, [currentPage, refetch]);

  useEffect(() => {
    return () => {
      setAllDelegates([]);
      setCurrentPage(1);
    };
  }, []);

  return {
    state: {
      data: allDelegates,
      currentPage,
      hasMore: proposalsQuery.data?.length === 10,
      isFetching: proposalsQuery.isFetching,
      error: proposalsQuery.error,
    },
    loadMoreData,
    refreshData,
    loadInitialData,
  };
}
