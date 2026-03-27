"use client";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useReadContract } from "wagmi";

import { abi as tokenAbi } from "@/config/abi/token";
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
  const t = useTranslations("common.governance");
  const daoConfig = useDaoConfig();
  const formatTokenAmount = useFormatGovernanceTokenAmount();
  const { data: governanceToken, isLoading: isGovernanceTokenLoading } =
    useGovernanceToken();

  // Use governance params hook for proposal type
  const {
    data: governanceParams,
    isQuorumFetching,
    isStaticLoading,
    isBlockTimeLoading,
  } = useGovernanceParams();

  const { data: totalSupply, isLoading: isTotalSupplyLoading } =
    useReadContract({
      address: daoConfig?.contracts?.governorToken?.address as `0x${string}`,
      abi: tokenAbi,
      functionName: "totalSupply",
      chainId: daoConfig?.chain?.id,
      query: {
        enabled:
          type === "default" &&
          !!daoConfig?.contracts?.governorToken?.address &&
          !!daoConfig?.chain?.id,
      },
    });

  const { data: dataMetrics, isLoading: isProposalMetricsLoading } = useQuery({
    queryKey: ["dataMetrics", daoConfig?.indexer?.endpoint],
    queryFn: () =>
      proposalService.getProposalMetrics(daoConfig?.indexer?.endpoint ?? ""),
    enabled: !!daoConfig?.indexer?.endpoint && type === "default",
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

      const votingDelayFormatted = isBlockTimeLoading
        ? null
        : governanceParams?.votingDelayInSeconds
        ? dayjsHumanize(governanceParams.votingDelayInSeconds) ?? t("none")
        : t("none");

      const votingPeriodFormatted = isBlockTimeLoading
        ? null
        : governanceParams?.votingPeriodInSeconds
        ? dayjsHumanize(governanceParams.votingPeriodInSeconds) ?? t("none")
        : t("none");

      const timeLockDelayFormatted = governanceParams?.timeLockDelayInSeconds
        ? dayjsHumanize(governanceParams.timeLockDelayInSeconds) ?? t("none")
        : t("none");

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
  }, [
    dataMetrics,
    formatTokenAmount,
    governanceParams,
    isBlockTimeLoading,
    t,
    totalSupply,
    type,
  ]);

  const explorerUrl = daoConfig?.chain?.explorers?.[0];

  if (type === "proposal") {
    return (
      <div className="flex flex-col gap-[20px] p-[20px] bg-card rounded-[14px] w-[360px] shadow-card">
        <div className="flex items-center gap-[10px]">
          <h2 className="text-[18px] font-semibold">{t("systemInfoTitle")}</h2>
        </div>

        <div className="h-px w-full bg-card-background"></div>

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
          label={t("proposalThreshold")}
          value={`${systemData.proposalThresholdFormatted} ${
            governanceToken?.symbol ?? ""
          }`}
          isLoading={isStaticLoading || isGovernanceTokenLoading}
        />

        <SystemInfoItem
          label={t("votingDelay")}
          value={systemData.votingDelayFormatted ?? t("none")}
          isLoading={isStaticLoading || (type === "proposal" && systemData.votingDelayFormatted === null)}
        />

        <SystemInfoItem
          label={t("votingPeriod")}
          value={systemData.votingPeriodFormatted ?? t("none")}
          isLoading={isStaticLoading || (type === "proposal" && systemData.votingPeriodFormatted === null)}
        />

        <SystemInfoItem
          label={t("quorumNeeded")}
          value={`${systemData.quorumFormatted} ${
            governanceToken?.symbol ?? ""
          }`}
          isLoading={isQuorumFetching || isGovernanceTokenLoading}
        />

        <SystemInfoItem
          label={t("timeLockDelay")}
          value={systemData.timeLockDelayFormatted ?? t("none")}
          isLoading={isStaticLoading}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[20px] p-[20px] bg-card rounded-[14px] w-[360px] shadow-card">
      <div className="flex items-center gap-[10px]">
        <h2 className="text-[18px] font-semibold">{t("systemInfoTitle")}</h2>
      </div>

      <div className="h-px w-full bg-card-background"></div>

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
        label={t("totalVotingPower")}
        value={`${systemData.totalVotingPower} ${
          governanceToken?.symbol ?? ""
        } (${systemData.votingPowerPercentage}%)`}
        isLoading={isProposalMetricsLoading || isGovernanceTokenLoading}
      />

      <SystemInfoItem
        label={t("totalSupply")}
        value={`${systemData.totalSupplyFormatted} ${
          governanceToken?.symbol ?? ""
        }`}
        isLoading={isTotalSupplyLoading || isGovernanceTokenLoading}
      />

      <SystemInfoItem
        label={t("totalDelegates")}
        value={systemData.totalDelegates ?? 0}
        isLoading={isProposalMetricsLoading}
      />
    </div>
  );
};
