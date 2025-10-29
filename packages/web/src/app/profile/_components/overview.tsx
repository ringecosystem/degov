import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAddressVotes } from "@/hooks/useAddressVotes";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { proposalService } from "@/services/graphql";

import { OverviewItem } from "./overview-item";

const PARTICIPATION_WINDOW = 10;

import type { Address } from "viem";

interface OverviewProps {
  address: Address;
  tokenBalance?: string;
  isLoadingTokenBalance?: boolean;
  delegationStatusText?: React.ReactNode;
  isDelegateMappingsLoading?: boolean;
  isOwnProfile?: boolean;
}

interface OverviewCardData {
  title: string;
  value?: React.ReactNode;
  isLoading?: boolean;
  link?: string;
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

  const { data: votedProposals, isLoading: isParticipationLoading } = useQuery({
    queryKey: [
      "proposalVoteRate",
      address,
      daoConfig?.indexer?.endpoint,
      PARTICIPATION_WINDOW,
    ],
    queryFn: () =>
      proposalService.getProposalVoteRate(
        daoConfig?.indexer?.endpoint ?? "",
        address,
        PARTICIPATION_WINDOW
      ),
    enabled: !!daoConfig?.indexer?.endpoint && !!address,
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

  const participationValue = useMemo(() => {
    if (!votedProposals) {
      return "-";
    }

    const total = votedProposals.length;
    const participatedCount = votedProposals.filter(
      (proposal) => proposal.voters.length > 0
    ).length;
    const participationRate = total
      ? (participatedCount / total) * 100
      : 0;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div>{`${participationRate.toFixed(0)}%`}</div>
        </TooltipTrigger>
        <TooltipContent className="bg-card border border-card-background shadow-xs max-w-[350px] rounded-[26px] p-[20px] text-[14px]">
          <span>{`Participated in ${participatedCount}/${total} proposals`}</span>
        </TooltipContent>
      </Tooltip>
    );
  }, [votedProposals]);

  const data: OverviewCardData[] = useMemo(() => {
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
        title: "Delegating To",
        value: delegationStatusText,
        isLoading: isDelegateMappingsLoading,
      },
      {
        title: "Participation Rate",
        value: participationValue,
        isLoading: isParticipationLoading,
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
    participationValue,
    isParticipationLoading,
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
