import { useEnsName } from "wagmi";

import { useProfileQuery } from "@/hooks/useProfileQuery";
import { formatShortAddress } from "@/utils/address";

import type { Address } from "viem";

interface AddressResolverProps {
  address: Address;
  showShortAddress?: boolean;
  skipFetch?: boolean;
  children: (value: string) => React.ReactNode;
}

export function AddressResolver({
  address,
  showShortAddress = false,
  skipFetch = false,
  children,
}: AddressResolverProps) {
  const { data: profileData } = useProfileQuery(address, { skip: skipFetch });

  const profileName = profileData?.data?.name;

  const { data: ensName } = useEnsName({
    address,
    chainId: 1,
    query: {
      staleTime: 1000 * 60 * 60,
      gcTime: 1000 * 60 * 60 * 24,
      // Even when profile fetching is skipped, still try ENS as a lightweight fallback
      enabled: !profileName,
    },
  });

  const displayValue =
    profileName ||
    ensName ||
    (showShortAddress ? formatShortAddress(address) : address);

  return <>{children(displayValue)}</>;
}
