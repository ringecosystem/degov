"use client";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { useReadContract } from "wagmi";

import { abi as tokenAbi } from "@/config/abi/token";
import { DEFAULT_REFETCH_INTERVAL } from "@/config/base";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import { useGovernanceParams } from "@/hooks/useGovernanceParams";
import { useGovernanceToken } from "@/hooks/useGovernanceToken";
import { proposalService } from "@/services/graphql";
import { formatShortAddress } from "@/utils/address";
import { dayjsHumanize } from "@/utils/date";
import { formatNumberForDisplay } from "@/utils/number";

import { Skeleton } from "./ui/skeleton";

interface SystemInfoItemProps {
  label: string;
  value: string | number;
  isLoading?: boolean;
  isAddress?: boolean;
  explorerUrl?: string;
}

const SystemInfoItem = ({
  label,
  value,
  isLoading,
  isAddress,
  explorerUrl,
}: SystemInfoItemProps) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-[14px]  text-muted-foreground">{label}</span>
        <Skeleton className="h-[22px] w-[120px]" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-[14px]  text-muted-foreground">{label}</span>
      <div className="flex items-center gap-[5px]">
        {isAddress && explorerUrl ? (
          <a
            href={`${explorerUrl}/address/${value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-[5px] text-[14px] text-foreground hover:opacity-80 transition-opacity"
          >
            {formatShortAddress(value as string)}
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : (
          <span className="text-[14px] text-foreground">
            {typeof value === "number"
              ? formatNumberForDisplay(value, 0)[0]
              : value}
          </span>
        )}
      </div>
    </div>
  );
};

interface SystemInfoProps {
  type?: "default" | "proposal";
}

export const SystemInfo = ({ type = "default" }: SystemInfoProps) => {
  const daoConfig = useDaoConfig();
  const formatTokenAmount = useFormatGovernanceTokenAmount();
  const { data: governanceToken, isLoading: isGovernanceTokenLoading } =
    useGovernanceToken();

  // Use governance params hook for proposal type
  const {
    data: governanceParams,
    isQuorumFetching,
    isStaticLoading,
  } = useGovernanceParams();

  const { data: totalSupply, isLoading: isTotalSupplyLoading } =
    useReadContract({
      address: daoConfig?.contracts?.governorToken?.address as `0x${string}`,
      abi: tokenAbi,
      functionName: "totalSupply",
      chainId: daoConfig?.chain?.id,
      query: {
        enabled:
          !!daoConfig?.contracts?.governorToken?.address &&
          !!daoConfig?.chain?.id,
        refetchInterval: DEFAULT_REFETCH_INTERVAL,
      },
    });

  const { data: dataMetrics, isLoading: isProposalMetricsLoading } = useQuery({
    queryKey: ["dataMetrics", daoConfig?.indexer?.endpoint],
    queryFn: () =>
      proposalService.getProposalMetrics(daoConfig?.indexer?.endpoint ?? ""),
    enabled: !!daoConfig?.indexer?.endpoint && type === "default",
    refetchInterval: DEFAULT_REFETCH_INTERVAL,
  });

  const systemData = useMemo(() => {
    if (type === "proposal") {
      const proposalThresholdFormatted = governanceParams?.proposalThreshold
        ? formatTokenAmount(governanceParams.proposalThreshold)?.formatted ??
          "0"
        : "0";

      const quorumFormatted = governanceParams?.quorum
        ? formatTokenAmount(governanceParams.quorum)?.formatted ?? "0"
        : "0";

      const votingDelayFormatted = governanceParams?.votingDelayInSeconds
        ? dayjsHumanize(governanceParams.votingDelayInSeconds) ?? "None"
        : "None";

      const votingPeriodFormatted = governanceParams?.votingPeriodInSeconds
        ? dayjsHumanize(governanceParams.votingPeriodInSeconds) ?? "None"
        : "None";

      const timeLockDelayFormatted = governanceParams?.timeLockDelayInSeconds
        ? dayjsHumanize(governanceParams.timeLockDelayInSeconds) ?? "None"
        : "None";

      return {
        proposalThresholdFormatted,
        quorumFormatted,
        votingDelayFormatted,
        votingPeriodFormatted,
        timeLockDelayFormatted,
      };
    } else {
      const totalVotingPower = dataMetrics?.powerSum
        ? formatTokenAmount(BigInt(dataMetrics.powerSum))?.formatted ?? "0"
        : "0";

      const totalSupplyFormatted = totalSupply
        ? formatTokenAmount(totalSupply)?.formatted ?? "0"
        : "0";

      const totalDelegates: number = dataMetrics?.memberCount ?? 0;

      const votingPowerPercentage =
        dataMetrics?.powerSum && totalSupply
          ? (
              (Number(dataMetrics.powerSum) / Number(totalSupply)) *
              100
            ).toFixed(2)
          : "0";

      return {
        totalVotingPower,
        totalSupplyFormatted,
        totalDelegates,
        votingPowerPercentage,
      };
    }
  }, [type, dataMetrics, totalSupply, formatTokenAmount, governanceParams]);

  const explorerUrl = daoConfig?.chain?.explorers?.[0];

  if (type === "proposal") {
    return (
      <div className="flex flex-col gap-[20px] p-[20px] bg-card rounded-[14px] w-[360px] shadow-card">
        <div className="flex items-center gap-[10px]">
          <h2 className="text-[18px] font-semibold">System Info</h2>
        </div>

        <div className="h-[1px] w-full bg-card-background"></div>

        <SystemInfoItem
          label="Governor Contract"
          value={daoConfig?.contracts?.governor ?? ""}
          isAddress={true}
          explorerUrl={explorerUrl}
        />

        <SystemInfoItem
          label="Token Contract"
          value={daoConfig?.contracts?.governorToken?.address ?? ""}
          isAddress={true}
          explorerUrl={explorerUrl}
        />

        {daoConfig?.contracts?.timeLock && (
          <SystemInfoItem
            label="TimeLock Contract"
            value={daoConfig?.contracts?.timeLock}
            isAddress={true}
            explorerUrl={explorerUrl}
          />
        )}

        <SystemInfoItem
          label="Proposal Threshold"
          value={`${systemData.proposalThresholdFormatted} ${
            governanceToken?.symbol ?? ""
          }`}
          isLoading={isStaticLoading || isGovernanceTokenLoading}
        />

        <SystemInfoItem
          label="Voting Delay"
          value={systemData.votingDelayFormatted ?? "None"}
          isLoading={isStaticLoading}
        />

        <SystemInfoItem
          label="Voting Period"
          value={systemData.votingPeriodFormatted ?? "None"}
          isLoading={isStaticLoading}
        />

        <SystemInfoItem
          label="Quorum Needed"
          value={`${systemData.quorumFormatted} ${
            governanceToken?.symbol ?? ""
          }`}
          isLoading={isQuorumFetching || isGovernanceTokenLoading}
        />

        <SystemInfoItem
          label="TimeLock Delay"
          value={systemData.timeLockDelayFormatted ?? "None"}
          isLoading={isStaticLoading}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[20px] p-[20px] bg-card rounded-[14px] w-[360px] shadow-card">
      <div className="flex items-center gap-[10px]">
        <h2 className="text-[18px] font-semibold">System Info</h2>
      </div>

      <div className="h-[1px] w-full bg-card-background"></div>

      <SystemInfoItem
        label="Governor Contract"
        value={daoConfig?.contracts?.governor ?? ""}
        isAddress={true}
        explorerUrl={explorerUrl}
      />

      <SystemInfoItem
        label="Token Contract"
        value={daoConfig?.contracts?.governorToken?.address ?? ""}
        isAddress={true}
        explorerUrl={explorerUrl}
      />

      <SystemInfoItem
        label="Total Voting Power"
        value={`${systemData.totalVotingPower} ${
          governanceToken?.symbol ?? ""
        } (${systemData.votingPowerPercentage}%)`}
        isLoading={isProposalMetricsLoading || isGovernanceTokenLoading}
      />

      <SystemInfoItem
        label="Total Supply"
        value={`${systemData.totalSupplyFormatted} ${
          governanceToken?.symbol ?? ""
        }`}
        isLoading={isTotalSupplyLoading || isGovernanceTokenLoading}
      />

      <SystemInfoItem
        label="Total Delegates"
        value={systemData.totalDelegates ?? 0}
        isLoading={isProposalMetricsLoading}
      />
    </div>
  );
};
