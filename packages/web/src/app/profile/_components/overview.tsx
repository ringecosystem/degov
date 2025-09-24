import { useMemo } from "react";

import { useAddressVotes } from "@/hooks/useAddressVotes";
import { useVotingPowerAgainstQuorum } from "@/hooks/useVotingPowerAgainstQuorum";

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
}: OverviewProps) => {
  const { formattedVotes, votes, isLoading } = useAddressVotes(address);

  const {
    calculatePercentage,
    quorum,
    isLoading: isQuorumLoading,
  } = useVotingPowerAgainstQuorum();

  const votingPowerWithPercentage = useMemo(() => {
    if (!formattedVotes || !votes || quorum === 0n) {
      return formattedVotes;
    }

    const percentage = calculatePercentage(votes);
    const percentageToDisplay = Number.isInteger(percentage)
      ? percentage.toFixed(0)
      : percentage.toFixed(2);

    return (
      <div className="flex items-center gap-[5px]">
        <div>{formattedVotes}</div>
        <div>({percentageToDisplay}% of Quorum)</div>
      </div>
    );
  }, [formattedVotes, votes, quorum, calculatePercentage]);

  const data = useMemo(() => {
    return [
      {
        title: "Total Voting Power",
        value: votingPowerWithPercentage,
        isLoading: isLoading || isQuorumLoading,
      },
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
        value: "View All",
        isLoading,
        link: `/proposals?address=${address}`,
      },
    ];
  }, [
    votingPowerWithPercentage,
    isLoading,
    isQuorumLoading,
    tokenBalance,
    isLoadingTokenBalance,
    delegationStatusText,
    isDelegateMappingsLoading,
    address,
  ]);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-[20px] w-full">
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
