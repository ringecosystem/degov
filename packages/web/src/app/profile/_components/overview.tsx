import { useMemo } from "react";

import { useAddressVotes } from "@/hooks/useAddressVotes";

import { OverviewItem } from "./overview-item";

import type { Address } from "viem";

interface OverviewProps {
  address: Address;
  tokenBalance?: string;
  isLoadingTokenBalance?: boolean;
  delegationStatusText?: React.ReactNode;
  isDelegateMappingsLoading?: boolean;
  isOwnProfile?: boolean;
}
export const Overview = ({
  address,
  tokenBalance,
  isLoadingTokenBalance,
  delegationStatusText,
  isDelegateMappingsLoading,
  isOwnProfile,
}: OverviewProps) => {
  const { formattedVotes, isLoading } = useAddressVotes(address);

  const data = useMemo(() => {
    return [
      { title: "Total Voting Power", value: formattedVotes, isLoading },
      {
        title: "Governance Balance",
        value: tokenBalance,
        isLoading: isLoadingTokenBalance,
      },
      {
        title: "Delegating",
        value: delegationStatusText,
        isLoading: isDelegateMappingsLoading,
      },
      {
        title: "My Proposals",
        value: "100",
        isLoading,
        link: isOwnProfile ? "/proposals?type=my" : undefined,
      },
    ];
  }, [
    formattedVotes,
    isLoading,
    tokenBalance,
    isLoadingTokenBalance,
    delegationStatusText,
    isDelegateMappingsLoading,
    isOwnProfile,
  ]);
  return (
    <div className="grid grid-cols-4 gap-[20px] w-full">
      {data.map((item) => (
        <OverviewItem
          key={item.title}
          title={item.title}
          value={item.value}
          isLoading={item.isLoading}
          link={item.link}
        />
      ))}
    </div>
  );
};
