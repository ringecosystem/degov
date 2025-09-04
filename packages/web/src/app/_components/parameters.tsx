"use client";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import { useGovernanceParams } from "@/hooks/useGovernanceParams";
import { useGovernanceToken } from "@/hooks/useGovernanceToken";
import { dayjsHumanize } from "@/utils/date";

export const Parameters = () => {
  const [open, setOpen] = useState(false);
  const {
    data: governanceParams,
    isStaticLoading,
    refetchClock,
  } = useGovernanceParams();
  const formatTokenAmount = useFormatGovernanceTokenAmount();
  const daoConfig = useDaoConfig();
  const { data: governanceToken } = useGovernanceToken();

  const formattedData = useMemo(() => {
    const proposalThresholdFormatted =
      governanceParams?.proposalThreshold !== undefined
        ? `${
            formatTokenAmount(governanceParams.proposalThreshold)?.formatted ??
            "0"
          } ${governanceToken?.symbol ?? ""}`
        : "None";

    const votingDelayFormatted =
      governanceParams?.votingDelayInSeconds !== undefined &&
      governanceParams?.votingDelayInSeconds !== null &&
      !isNaN(governanceParams.votingDelayInSeconds)
        ? dayjsHumanize(governanceParams.votingDelayInSeconds)
        : "None";

    const votingPeriodFormatted =
      governanceParams?.votingPeriodInSeconds !== undefined &&
      governanceParams?.votingPeriodInSeconds !== null &&
      !isNaN(governanceParams.votingPeriodInSeconds)
        ? dayjsHumanize(governanceParams.votingPeriodInSeconds)
        : "None";

    const timeLockDelayFormatted =
      governanceParams?.timeLockDelay !== undefined
        ? dayjsHumanize(Number(governanceParams.timeLockDelay))
        : "None";

    return {
      proposalThresholdFormatted,
      votingDelayFormatted,
      votingPeriodFormatted,
      timeLockDelayFormatted,
    };
  }, [governanceParams, formatTokenAmount, governanceToken?.symbol]);

  useEffect(() => {
    if (open) {
      refetchClock();
    }
  }, [open, refetchClock]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="rounded-full border-always-light bg-transparent text-always-light hover:bg-transparent hover:text-always-light hover:opacity-80 duration-300 transition-opacity"
          size="sm"
        >
          Parameters
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="flex w-[90vw] lg:w-[240px] flex-col gap-[20px] rounded-[14px] border-border/20 bg-card p-[20px] mr-[5vw] lg:mr-0"
        align="start"
      >
        <div className="text-[16px] font-semibold text-foreground">
          Parameters
        </div>
        <div className="flex flex-col gap-[20px]">
          <div className="flex items-center justify-between gap-[10px]">
            <span className="text-[14px] font-normal text-foreground/40">
              Proposal threshold
            </span>
            <span className="text-[14px] font-normal text-foreground">
              {isStaticLoading ? (
                <Skeleton className="h-[14px] w-[30px]" />
              ) : (
                formattedData.proposalThresholdFormatted
              )}
            </span>
          </div>

          <div className="flex items-center justify-between gap-[10px]">
            <span className="text-[14px] font-normal text-foreground/40">
              Proposal delay
            </span>
            <span className="text-[14px] font-normal text-foreground">
              {isStaticLoading ? (
                <Skeleton className="h-[14px] w-[30px]" />
              ) : (
                formattedData.votingDelayFormatted
              )}
            </span>
          </div>

          <div className="flex items-center justify-between gap-[10px]">
            <span className="text-[14px] font-normal text-foreground/40">
              Voting period
            </span>
            <span className="text-[14px] font-normal text-foreground">
              {isStaticLoading ? (
                <Skeleton className="h-[14px] w-[30px]" />
              ) : (
                formattedData.votingPeriodFormatted
              )}
            </span>
          </div>

          {daoConfig?.contracts?.timeLock && (
            <div className="flex items-center justify-between gap-[10px]">
              <span className="text-[14px] font-normal text-foreground/40">
                TimeLock delay
              </span>
              <span className="text-[14px] font-normal text-foreground">
                {isStaticLoading ? (
                  <Skeleton className="h-[14px] w-[30px]" />
                ) : (
                  formattedData.timeLockDelayFormatted
                )}
              </span>
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
