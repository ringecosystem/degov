"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { AlertCircleIcon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getDisplayText, getStatusColor } from "@/config/proposals";
import { proposalService } from "@/services/graphql";
import { ProposalState } from "@/types/proposal";
import { CACHE_TIMES } from "@/utils/query-config";

const SUMMARY_STATE_ORDER = [
  "PENDING",
  "ACTIVE",
  "SUCCEEDED",
  "EXECUTED",
  "DEFEATED",
  "CANCELED",
] as const;

const GRAPH_STATE_TO_PROPOSAL_STATE: Partial<Record<string, ProposalState>> = {
  PENDING: ProposalState.Pending,
  ACTIVE: ProposalState.Active,
  SUCCEEDED: ProposalState.Succeeded,
  EXECUTED: ProposalState.Executed,
  DEFEATED: ProposalState.Defeated,
  CANCELED: ProposalState.Canceled,
  CANCELLED: ProposalState.Canceled,
  QUEUED: ProposalState.Queued,
  EXPIRED: ProposalState.Expired,
};

type SummaryListItem = {
  key: string;
  label: string;
  count: number;
  colorVar: string;
};

const normalizeStateKey = (state?: string | null) =>
  (state ?? "").toUpperCase().replace("CANCELLED", "CANCELED");

type OverviewProposalsSummaryDropdownProps = {
  daoCode?: string;
};

export const OverviewProposalsSummaryDropdown = ({
  daoCode,
}: OverviewProposalsSummaryDropdownProps) => {
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  const getColorVar = (state?: ProposalState) => {
    if (!state) return "--muted-foreground";
    const { text } = getStatusColor(state);
    return text?.startsWith("text-")
      ? `--${text.replace("text-", "")}`
      : "--muted-foreground";
  };

  const { data: rawSummaryStates = [], isLoading: isSummaryStatesLoading } =
    useQuery({
      queryKey: ["summaryProposalStates", daoCode],
      queryFn: () => proposalService.getSummaryProposalStates(daoCode ?? ""),
      enabled: !!daoCode,
      staleTime: CACHE_TIMES.ONE_MINUTE,
      refetchOnMount: "always",
      placeholderData: keepPreviousData,
    });

  const summaryStateCounts = useMemo(() => {
    return (rawSummaryStates ?? []).reduce<Record<string, number>>(
      (accumulator, item) => {
        const key = normalizeStateKey(item?.state);
        if (!key) return accumulator;
        accumulator[key] = Number(item?.count ?? 0);
        return accumulator;
      },
      {}
    );
  }, [rawSummaryStates]);

  const summaryItems = useMemo<SummaryListItem[]>(() => {
    const ordered = SUMMARY_STATE_ORDER.map((stateKey) => {
      const proposalState = GRAPH_STATE_TO_PROPOSAL_STATE[stateKey];
      const colorVar = getColorVar(proposalState);
      const label = proposalState
        ? getDisplayText(proposalState)
        : stateKey.charAt(0) + stateKey.slice(1).toLowerCase();
      return {
        key: stateKey,
        label,
        count: summaryStateCounts[stateKey] ?? 0,
        colorVar,
      };
    });

    const extras = Object.keys(summaryStateCounts)
      .filter((stateKey) => !SUMMARY_STATE_ORDER.includes(stateKey as never))
      .map((stateKey) => {
        const proposalState = GRAPH_STATE_TO_PROPOSAL_STATE[stateKey];
        const colorVar = getColorVar(proposalState);
        const label = proposalState
          ? getDisplayText(proposalState)
          : stateKey.charAt(0) + stateKey.slice(1).toLowerCase();
        return {
          key: stateKey,
          label,
          count: summaryStateCounts[stateKey] ?? 0,
          colorVar,
        };
      });

    return [...ordered, ...extras];
  }, [summaryStateCounts]);

  return (
    <DropdownMenu open={isSummaryOpen} onOpenChange={setIsSummaryOpen}>
      <DropdownMenuTrigger asChild>
        <div
          className="flex size-[20px] items-center justify-center rounded-full text-foreground/60 transition-colors hover:text-foreground cursor-pointer"
          aria-haspopup="dialog"
          aria-expanded={isSummaryOpen}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <AlertCircleIcon width={16} height={16} className="shrink-0" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        side="top"
        sideOffset={12}
        className="w-56 border border-border/20 bg-card p-[20px] text-foreground shadow-card rounded-[26px]"
      >
        <div className="flex flex-col justify-start gap-[20px]">
          {isSummaryStatesLoading ? (
            <div className="text-sm text-foreground/60">Loading...</div>
          ) : (
            summaryItems.map((item) => (
              <div
                key={item.key}
                className="inline-flex w-full items-center justify-start gap-2.5"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: `var(${item.colorVar})` }}
                />
                <span className="flex-1 text-sm text-foreground/70">
                  {item.label}
                </span>
                <span className="text-right text-sm text-foreground">
                  {item.count}
                </span>
              </div>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
