"use client";
import { useReadContract } from "wagmi";

import { abi as tokenAbi } from "@/config/abi/token";
import { useConfig } from "@/hooks/useConfig";
import { useGovernanceToken } from "@/hooks/useGovernanceToken";
import { formatBigIntForDisplay, formatNumberForDisplay } from "@/utils/number";

import { OverviewItem } from "./overview-item";
import { ProposalsStatusDetail } from "./proposals-status-detail";

export const Overview = () => {
  const daoConfig = useConfig();
  const { data: totalSupply, isLoading: isTotalSupplyLoading } =
    useReadContract({
      address: daoConfig?.contracts?.governorToken?.contract as `0x${string}`,
      abi: tokenAbi,
      functionName: "totalSupply",
      chainId: daoConfig?.network?.chainId,
      query: {
        enabled:
          !!daoConfig?.contracts?.governorToken?.contract &&
          !!daoConfig?.network?.chainId,
      },
    });

  const { data: governanceToken, isLoading: isGovernanceTokenLoading } =
    useGovernanceToken();

  return (
    <div className="flex flex-col gap-[20px]">
      <h3 className="text-[18px] font-extrabold">Overview</h3>
      <div className="grid grid-cols-2 gap-[20px] xl:grid-cols-4">
        <OverviewItem
          title="Proposals"
          icon="/assets/image/proposals-colorful.svg"
        >
          <div className="flex items-center gap-[10px]">
            <p>{formatNumberForDisplay(102314120)[0]}</p>
            <ProposalsStatusDetail />
          </div>
        </OverviewItem>
        <OverviewItem title="Members" icon="/assets/image/members-colorful.svg">
          <p>{formatNumberForDisplay(1010)[0]}</p>
        </OverviewItem>
        <OverviewItem
          title="Total voting Power"
          icon="/assets/image/total-vote-colorful.svg"
        >
          <p>{formatNumberForDisplay(100)[0]}</p>
        </OverviewItem>
        <OverviewItem
          title="Total Supply"
          isLoading={isTotalSupplyLoading || isGovernanceTokenLoading}
          icon="/assets/image/delegated-vote-colorful.svg"
        >
          <p>
            {formatBigIntForDisplay(
              totalSupply ?? BigInt(0),
              governanceToken?.decimals ?? 18
            )}
          </p>
        </OverviewItem>
      </div>
    </div>
  );
};
