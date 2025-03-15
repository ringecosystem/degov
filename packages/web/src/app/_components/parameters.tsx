"use client";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import { useGovernanceParams } from "@/hooks/useGovernanceParams";
import { dayjsHumanize } from "@/utils/date";

export const Parameters = () => {
  const [open, setOpen] = useState(false);
  const {
    data: governanceParams,
    isQuorumFetching,
    isStaticLoading,
    refetchClock,
  } = useGovernanceParams();
  const formatTokenAmount = useFormatGovernanceTokenAmount();

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
          className="rounded-full border-border bg-card"
          size="sm"
        >
          Parameters
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="flex w-[240px] flex-col gap-[20px] rounded-[14px] border-border/20 bg-card p-[20px]"
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
              ) : governanceParams?.proposalThreshold ? (
                formatTokenAmount(governanceParams?.proposalThreshold)
                  ?.formatted
              ) : (
                "-"
              )}
            </span>
          </div>

          <div className="flex items-center justify-between gap-[10px]">
            <span className="text-[14px] font-normal text-foreground/40">
              Quorum needed
            </span>
            <span className="text-[14px] font-normal text-foreground">
              {isQuorumFetching ? (
                <Skeleton className="h-[14px] w-[30px]" />
              ) : governanceParams?.quorum ? (
                formatTokenAmount(governanceParams?.quorum)?.formatted
              ) : (
                "0"
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
              ) : governanceParams?.votingDelay ? (
                dayjsHumanize(Number(governanceParams?.votingDelay))
              ) : (
                "None"
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
              ) : governanceParams?.votingPeriod ? (
                dayjsHumanize(Number(governanceParams?.votingPeriod))
              ) : (
                "None"
              )}
            </span>
          </div>

          <div className="flex items-center justify-between gap-[10px]">
            <span className="text-[14px] font-normal text-foreground/40">
              TimeLock delay
            </span>
            <span className="text-[14px] font-normal text-foreground">
              {isStaticLoading ? (
                <Skeleton className="h-[14px] w-[30px]" />
              ) : governanceParams?.timeLockDelay ? (
                dayjsHumanize(Number(governanceParams?.timeLockDelay))
              ) : (
                "None"
              )}
            </span>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
