import { useQuery } from "@tanstack/react-query";

import { useDaoConfig } from "@/hooks/useDaoConfig";
import { profileService } from "@/services/graphql";

import type { Address } from "viem";

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
  });
};
