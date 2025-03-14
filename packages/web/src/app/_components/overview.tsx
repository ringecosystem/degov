"use client";
import { useQuery } from "@tanstack/react-query";
import { isNumber } from "lodash-es";
import { useMemo } from "react";
import { useReadContract } from "wagmi";

import { abi as tokenAbi } from "@/config/abi/token";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import { useMembersVotingPower } from "@/hooks/useMembersVotingPower";
import { memberService, proposalService } from "@/services/graphql";
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
      },
    });

  const { data: proposalTotal, isLoading: isProposalTotalLoading } = useQuery({
    queryKey: ["proposalTotal"],
    queryFn: () =>
      proposalService.getProposalTotal(daoConfig?.indexer?.endpoint ?? ""),
    enabled: !!daoConfig?.indexer?.endpoint,
  });

  const { data: members, isLoading: isMembersLoading } = useQuery({
    queryKey: ["members"],
    queryFn: () => memberService.getAllMembers(),
  });
  const { votingPowerMap, isLoading: isVotingPowerLoading } =
    useMembersVotingPower(members?.data ?? []);

  const totalVotingPower = useMemo(() => {
    return Object.values(votingPowerMap).reduce(
      (acc, curr) => acc + curr.raw,
      0n
    );
  }, [votingPowerMap]);

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
        <OverviewItem
          title="Members"
          icon="/assets/image/members-colorful.svg"
          isLoading={isMembersLoading}
        >
          <p>{formatNumberForDisplay(members?.data?.length ?? 0)[0]}</p>
        </OverviewItem>
        <OverviewItem
          title="Total voting Power"
          icon="/assets/image/total-vote-colorful.svg"
          isLoading={isVotingPowerLoading || isMembersLoading}
        >
          <p>{formatTokenAmount(totalVotingPower ?? 0n)?.formatted}</p>
        </OverviewItem>
        <OverviewItem
          title="Total Supply"
          isLoading={isTotalSupplyLoading}
          icon="/assets/image/delegated-vote-colorful.svg"
        >
          <p>{formatTokenAmount(totalSupply ?? 0n)?.formatted}</p>
        </OverviewItem>
      </div>
    </div>
  );
};
