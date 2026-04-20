import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { useDaoConfig } from "@/hooks/useDaoConfig";
import { ensService } from "@/services/graphql";
import { ensRecordQueryKey } from "@/utils/ens-query";

const DEFAULT_STALE_TIME = 60 * 60 * 1000;

interface UseBatchEnsRecordsOptions {
  queryKeyPrefix?: (string | number | undefined)[];
  enabled?: boolean;
  staleTime?: number;
}

export function useBatchEnsRecords(
  rawAddresses: string[] = [],
  options: UseBatchEnsRecordsOptions = {}
) {
  const daoConfig = useDaoConfig();
  const queryClient = useQueryClient();

  const normalizedAddresses = useMemo(
    () =>
      Array.from(
        new Set(
          rawAddresses
            .map((address) => address.trim().toLowerCase())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [rawAddresses]
  );

  const queryKeyPrefix = options.queryKeyPrefix ?? ["ensRecords"];

  const query = useQuery({
    queryKey: [
      ...queryKeyPrefix,
      daoConfig?.code,
      normalizedAddresses,
      options.staleTime,
    ],
    enabled: options.enabled ?? !!normalizedAddresses.length,
    staleTime: options.staleTime ?? DEFAULT_STALE_TIME,
    queryFn: async () => {
      const staleTime = options.staleTime ?? DEFAULT_STALE_TIME;
      const now = Date.now();

      const addressesToFetch = normalizedAddresses.filter((address) => {
        const key = ensRecordQueryKey(daoConfig?.code, address);
        const state = queryClient.getQueryState(key);

        if (!state) return true;
        if (state.fetchStatus === "fetching") return false;
        if (state.isInvalidated) return true;

        return now - state.dataUpdatedAt > staleTime;
      });

      if (!addressesToFetch.length) {
        return [];
      }

      const records = await ensService.getEnsRecords({
        addresses: addressesToFetch,
        daoCode: daoConfig?.code,
      });

      records.forEach((record) => {
        if (!record.address) return;

        const key = ensRecordQueryKey(daoConfig?.code, record.address);
        queryClient.setQueryData(key, record);
      });

      return records;
    },
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  };
}
