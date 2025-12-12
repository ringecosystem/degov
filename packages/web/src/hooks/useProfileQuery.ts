import { useQuery } from "@tanstack/react-query";

import { useDaoConfig } from "@/hooks/useDaoConfig";
import { profileService } from "@/services/graphql";

import type { Address } from "viem";

const STALE_TIME = 5 * 60 * 1000; // 5 minutes
const GC_TIME = 30 * 60 * 1000; // 30 minutes

export const normalizeAddress = (address: string): string =>
  address.toLowerCase();

export const profileQueryKey = (
  daoCode: string | undefined,
  address: string | undefined
) =>
  [
    "profile",
    daoCode ?? "default",
    address ? normalizeAddress(address) : undefined,
  ] as const;

interface UseProfileQueryOptions {
  skip?: boolean;
}

export const useProfileQuery = (
  address?: Address,
  options?: UseProfileQueryOptions
) => {
  const daoConfig = useDaoConfig();
  const normalized = address ? normalizeAddress(address) : undefined;
  const skip = options?.skip ?? false;

  const key = profileQueryKey(daoConfig?.code, normalized);

  return useQuery({
    queryKey: key,
    queryFn: () => profileService.getProfile(normalized as string),
    enabled: !!normalized && !skip,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });
};
