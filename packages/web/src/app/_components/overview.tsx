"use client";
import { useQuery } from "@tanstack/react-query";
import { isNumber } from "lodash-es";
import { useReadContract } from "wagmi";

import { abi as tokenAbi } from "@/config/abi/token";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useGovernanceToken } from "@/hooks/useGovernanceToken";
import { proposalService } from "@/services/graphql";
import { formatBigIntForDisplay, formatNumberForDisplay } from "@/utils/number";

import { OverviewItem } from "./overview-item";

export const Overview = () => {
  const daoConfig = useDaoConfig();
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
      },
    });

  const { data: proposalTotal, isLoading: isProposalTotalLoading } = useQuery({
    queryKey: ["proposalTotal"],
    queryFn: () =>
      proposalService.getProposalTotal(daoConfig?.indexer?.endpoint ?? ""),
    enabled: !!daoConfig?.indexer?.endpoint,
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
          isLoading={isProposalTotalLoading}
        >
          <div className="flex items-center gap-[10px]">
            <p>
              {
                formatNumberForDisplay(
                  isNumber(proposalTotal) ? proposalTotal : 0
                )[0]
              }
            </p>
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
