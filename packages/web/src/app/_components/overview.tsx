"use client";
import { useQuery } from "@tanstack/react-query";
import { isNumber } from "lodash-es";
import { useReadContract } from "wagmi";

import { abi as tokenAbi } from "@/config/abi/token";
import { DEFAULT_REFETCH_INTERVAL } from "@/config/base";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import { proposalService } from "@/services/graphql";
import { formatNumberForDisplay } from "@/utils/number";

import { OverviewItem } from "./overview-item";

export const Overview = () => {
  const daoConfig = useDaoConfig();
  const formatTokenAmount = useFormatGovernanceTokenAmount();
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
    enabled: !!daoConfig?.indexer?.endpoint,
    refetchInterval: DEFAULT_REFETCH_INTERVAL,
  });

  return (
    <div className="flex flex-col gap-[15px] lg:gap-[20px]">
      <h3 className="text-[16px] lg:text-[18px] font-extrabold text-foreground">
        Overview
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[15px] lg:gap-[20px] xl:grid-cols-4">
        <OverviewItem
          title="Proposals"
          link={`/proposals`}
          icon="/assets/image/proposals-colorful.svg"
          isLoading={isProposalMetricsLoading}
        >
          <div className="flex items-center gap-[8px] lg:gap-[10px]">
            {
              formatNumberForDisplay(
                isNumber(dataMetrics?.proposalsCount)
                  ? dataMetrics?.proposalsCount
                  : 0,
                0
              )[0]
            }
          </div>
        </OverviewItem>
        <OverviewItem
          title="Delegates"
          link={`/delegates`}
          icon="/assets/image/members-colorful.svg"
          isLoading={isProposalMetricsLoading}
        >
          {formatNumberForDisplay(dataMetrics?.memberCount ?? 0, 0)[0]}
        </OverviewItem>
        <OverviewItem
          title="Total Voting Power"
          icon="/assets/image/total-vote-colorful.svg"
          isLoading={isProposalMetricsLoading}
        >
          {
            formatTokenAmount(
              dataMetrics?.powerSum ? BigInt(dataMetrics?.powerSum) : 0n
            )?.formatted
          }
        </OverviewItem>
        <OverviewItem
          title="Total Supply"
          isLoading={isTotalSupplyLoading}
          icon="/assets/image/delegated-vote-colorful.svg"
        >
          {formatTokenAmount(totalSupply ?? 0n)?.formatted}
        </OverviewItem>
      </div>
    </div>
  );
};
