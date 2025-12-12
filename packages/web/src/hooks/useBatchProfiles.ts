import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { useDaoConfig } from "@/hooks/useDaoConfig";
import { normalizeAddress, profileQueryKey } from "@/hooks/useProfileQuery";
import { memberService } from "@/services/graphql";
import type { Member } from "@/services/graphql/types";

interface UseBatchProfilesOptions {
  queryKeyPrefix?: (string | number | undefined)[];
  enabled?: boolean;
  chunkSize?: number;
  staleTime?: number;
}

const DEFAULT_CHUNK_SIZE = 150;
const DEFAULT_STALE_TIME = 5 * 60 * 1000;

const chunkArray = <T>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

export function useBatchProfiles(
  rawAddresses: string[] = [],
  options: UseBatchProfilesOptions = {}
) {
  const daoConfig = useDaoConfig();
  const queryClient = useQueryClient();

  const normalizedAddresses = useMemo(
    () =>
      Array.from(
        new Set(rawAddresses.map((addr) => normalizeAddress(addr)))
      ).sort((a, b) => a.localeCompare(b)),
    [rawAddresses]
  );

  const queryKeyPrefix = options.queryKeyPrefix ?? ["profilePull"];
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;

  const query = useQuery<{ code: number; data: Member[]; message?: string }>({
    queryKey: [
      ...queryKeyPrefix,
      daoConfig?.code,
      normalizedAddresses,
      chunkSize,
      options.staleTime,
    ],
    enabled: options.enabled ?? !!normalizedAddresses.length,
    staleTime: options.staleTime ?? DEFAULT_STALE_TIME,
    queryFn: async () => {
      if (!normalizedAddresses.length) {
        return { code: 0, data: [], message: "empty" };
      }

      const profileStaleTime = options.staleTime ?? DEFAULT_STALE_TIME;
      const now = Date.now();

      const addressesToFetch = normalizedAddresses.filter((address) => {
        const key = profileQueryKey(daoConfig?.code, address);
        const state = queryClient.getQueryState(key);

        if (!state) return true;
        if (state.fetchStatus === "fetching") return false;
        if (state.isInvalidated) return true;

        return now - state.dataUpdatedAt > profileStaleTime;
      });

      if (!addressesToFetch.length) {
        return { code: 0, data: [], message: "cache-hit" };
      }

      const batches = chunkArray(addressesToFetch, chunkSize);
      const results = await Promise.all(
        batches.map((batch) => memberService.getProfilePull(batch))
      );

      const merged = results.flatMap((item) => item?.data ?? []);

      merged.forEach((item) => {
        const key = profileQueryKey(daoConfig?.code, item.address);
        queryClient.setQueryData(key, {
          code: 0,
          data: item,
        });
      });

      return { code: 0, data: merged, message: "ok" };
    },
  });

  return {
    data: query.data?.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  };
}
