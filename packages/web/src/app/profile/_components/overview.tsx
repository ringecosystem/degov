import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useAddressVotes } from "@/hooks/useAddressVotes";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { proposalService } from "@/services/graphql";

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
  const daoConfig = useDaoConfig();

  const { data: dataMetrics, isLoading: isMetricsLoading } = useQuery({
    queryKey: ["dataMetrics", daoConfig?.indexer?.endpoint],
    queryFn: () =>
      proposalService.getProposalMetrics(daoConfig?.indexer?.endpoint ?? ""),
    enabled: !!daoConfig?.indexer?.endpoint,
  });

  const votingPowerWithPercentage = useMemo(() => {
    if (!votes || !dataMetrics?.powerSum) {
      return formattedVotes;
    }

    const totalPower = BigInt(dataMetrics.powerSum);
    const percentage =
      totalPower > 0n ? Number((votes * 10000n) / totalPower) / 100 : 0;

    return (
      <div className="flex items-center gap-[5px]">
        <div>{formattedVotes}</div>
        <div>({percentage.toFixed(2)}%)</div>
      </div>
    );
  }, [formattedVotes, votes, dataMetrics?.powerSum]);

  const data = useMemo(() => {
    return [
      {
        title: "Total Voting Power",
        value: votingPowerWithPercentage,
        isLoading: isLoading || isMetricsLoading,
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
    isMetricsLoading,
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
