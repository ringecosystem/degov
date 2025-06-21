"use client";
import { useMemo } from "react";

import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import { cn } from "@/lib/utils";

interface VoteStatisticsProps {
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
  className?: string;
}

export const VoteStatistics = ({
  forVotes,
  againstVotes,
  abstainVotes,
  className,
}: VoteStatisticsProps) => {
  const formatTokenAmount = useFormatGovernanceTokenAmount();

  const { forPercentage, againstPercentage, abstainPercentage } =
    useMemo(() => {
      const total = forVotes + againstVotes + abstainVotes;

      if (total === 0n) {
        return {
          forPercentage: 0,
          againstPercentage: 0,
          abstainPercentage: 0,
        };
      }

      const forPct = (Number(forVotes) / Number(total)) * 100;
      const againstPct = (Number(againstVotes) / Number(total)) * 100;
      const abstainPct = (Number(abstainVotes) / Number(total)) * 100;

      return {
        forPercentage: forPct,
        againstPercentage: againstPct,
        abstainPercentage: abstainPct,
      };
    }, [forVotes, againstVotes, abstainVotes]);

  const formattedForVotes = formatTokenAmount(forVotes).formatted;
  const formattedAgainstVotes = formatTokenAmount(againstVotes).formatted;
  if (forVotes === 0n && againstVotes === 0n && abstainVotes === 0n) {
    return (
      <span className="text-[16px] font-normal text-muted-foreground ">
        No votes
      </span>
    );
  }

  return (
    <div className={cn("flex items-center gap-[10px]", className)}>
      <span className="text-[16px] font-normal text-foreground text-left">
        {formattedForVotes}
      </span>

      <div className="flex-1 flex h-[5px] overflow-hidden gap-[5px]">
        <div
          className="h-full bg-success transition-all duration-300 rounded-l-[2px]"
          style={{
            width: `${forPercentage}%`,
          }}
        />

        <div
          className="h-full bg-muted-foreground transition-all duration-300"
          style={{
            width: `${abstainPercentage}%`,
          }}
        />

        <div
          className="h-full bg-danger transition-all duration-300 rounded-r-[2px]"
          style={{
            width: `${againstPercentage}%`,
          }}
        />
      </div>

      <span className="text-[16px] font-normal text-foreground text-right">
        {formattedAgainstVotes}
      </span>
    </div>
  );
};
