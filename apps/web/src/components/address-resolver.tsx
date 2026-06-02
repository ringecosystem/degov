import { useQuery } from "@tanstack/react-query";

import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useProfileQuery } from "@/hooks/useProfileQuery";
import { ensService } from "@/services/graphql";
import { formatShortAddress } from "@/utils/address";
import { ensRecordQueryKey } from "@/utils/ens-query";
import { QUERY_CONFIGS } from "@/utils/query-config";

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
  const daoConfig = useDaoConfig();
  const { data: profileData } = useProfileQuery(address, { skip: skipFetch });

  const profileName = profileData?.data?.name;
  const normalizedAddress = address.toLowerCase();

  const { data: ensRecord } = useQuery({
    queryKey: ensRecordQueryKey(daoConfig?.code, normalizedAddress),
    queryFn: () =>
      ensService.getEnsRecord({
        address: normalizedAddress,
        daoCode: daoConfig?.code,
      }),
    enabled: !profileName,
    ...QUERY_CONFIGS.STATIC,
  });

  const ensName = ensRecord?.name ?? undefined;
  const displayValue =
    profileName ||
    ensName ||
    (showShortAddress ? formatShortAddress(address) : address);

  return <>{children(displayValue)}</>;
}
