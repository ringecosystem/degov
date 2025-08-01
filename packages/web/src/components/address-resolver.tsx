import { useQuery } from "@tanstack/react-query";
import { useEnsName } from "wagmi";

import { useAiBotAddress } from "@/hooks/useAiBotAddress";
import { profileService } from "@/services/graphql";
import { formatShortAddress } from "@/utils/address";

import type { Address } from "viem";

interface AddressResolverProps {
  address: Address;
  showShortAddress?: boolean;
  children: (value: string) => React.ReactNode;
}

export function AddressResolver({
  address,
  showShortAddress = false,
  children,
}: AddressResolverProps) {
  const { data: ensName } = useEnsName({
    address,
    chainId: 1,
  });

  const { isAiBot } = useAiBotAddress(address);

  const { data: profileData } = useQuery({
    queryKey: ["profile", address],
    queryFn: () => profileService.getProfile(address),
    enabled: !!address,
  });

  const displayValue = isAiBot
    ? "DeGov Agent"
    : profileData?.data?.name ||
      ensName ||
      (showShortAddress ? formatShortAddress(address) : address);

  return <>{children(displayValue)}</>;
}
