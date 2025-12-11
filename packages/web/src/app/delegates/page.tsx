"use client";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useDebounce } from "react-use";
import { useAccount } from "wagmi";

import { DelegateAction } from "@/components/delegate-action";
import { MembersList } from "@/components/members-list";
import {
  MembersTable,
  DEFAULT_SORT_STATE,
  type MemberSortDirection,
  type MemberSortField,
  type MemberSortState,
} from "@/components/members-table";
import { ResponsiveRenderer } from "@/components/responsive-renderer";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { WithConnect } from "@/components/with-connect";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { proposalService } from "@/services/graphql";
import type { ContributorItem } from "@/services/graphql/types";

import type { Address } from "viem";

const SystemInfo = dynamic(
  () => import("@/components/system-info").then((mod) => mod.SystemInfo),
  {
    loading: () => (
      <div className="h-[300px] w-[360px] bg-card rounded-[14px] animate-pulse" />
    )
  }
);

const Faqs = dynamic(
  () => import("@/components/faqs").then((mod) => mod.Faqs),
  {
    loading: () => (
      <div className="h-[200px] bg-card rounded-[14px] animate-pulse" />
    )
  }
);

const ORDER_BY_MAP: Record<
  MemberSortField,
  Record<MemberSortDirection, string>
> = {
  lastVoted: {
    asc: "lastVoteTimestamp_ASC_NULLS_LAST",
    desc: "lastVoteTimestamp_DESC_NULLS_LAST",
  },
  power: {
    asc: "power_ASC",
    desc: "power_DESC",
  },
  delegators: {
    asc: "delegatesCountAll_ASC",
    desc: "delegatesCountAll_DESC",
  },
};

export default function Members() {
  const { isConnected } = useAccount();
  const daoConfig = useDaoConfig();
  const [address, setAddress] = useState<Address | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [isLoadAttempted, setIsLoadAttempted] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [sortState, setSortState] =
    useState<MemberSortState>(DEFAULT_SORT_STATE);
  const [hasUserSorted, setHasUserSorted] = useState(false);

  // Debounce search term
  useDebounce(
    () => {
      setDebouncedSearchTerm(searchTerm?.trim());
    },
    300,
    [searchTerm]
  );

  const { data: proposalMetrics } = useQuery({
    queryKey: ["proposalMetrics", daoConfig?.indexer?.endpoint],
    queryFn: () =>
      proposalService.getProposalMetrics(
        daoConfig?.indexer?.endpoint as string
      ),
    enabled: !!daoConfig?.indexer?.endpoint,
  });

  const handleDelegate = useCallback(
    (value: ContributorItem) => {
      if (!isConnected) {
        setIsLoadAttempted(true);
        return;
      }

      setAddress(value?.id as `0x${string}`);
      setOpen(true);
    },
    [isConnected]
  );

  useEffect(() => {
    return () => {
      setAddress(undefined);
      setOpen(false);
      setIsLoadAttempted(false);
    };
  }, []);

  const orderBy = ORDER_BY_MAP[sortState.field][sortState.direction];
  const queryOrderBy =
    !hasUserSorted &&
    sortState.field === DEFAULT_SORT_STATE.field &&
    sortState.direction === DEFAULT_SORT_STATE.direction
      ? undefined
      : orderBy;

  const applySortState = (
    field: MemberSortField,
    direction?: MemberSortDirection
  ) => {
    if (!direction) {
      setHasUserSorted(false);
      setSortState(DEFAULT_SORT_STATE);
      return;
    }
    setHasUserSorted(true);
    setSortState({ field, direction });
  };

  const handleLastVotedSortChange = (direction?: MemberSortDirection) =>
    applySortState("lastVoted", direction);

  const handlePowerSortChange = (direction?: MemberSortDirection) =>
    applySortState("power", direction);

  const handleDelegatorsSortChange = (direction?: MemberSortDirection) =>
    applySortState("delegators", direction);

  const getDisplayTitle = () => {
    const totalCount = proposalMetrics?.memberCount;
    if (totalCount !== undefined) {
      return `Delegates (${totalCount})`;
    }
    return "Delegates";
  };

  const showConnectPrompt = !isConnected && isLoadAttempted;

  if (showConnectPrompt) {
    return (
      <WithConnect>
        <div className="flex flex-col gap-[15px] lg:gap-[20px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-[10px] sm:gap-[20px]">
            <h3 className="text-[16px] lg:text-[18px] font-extrabold">
              {getDisplayTitle()}
            </h3>
            <div className="flex h-[36px] w-full sm:w-[388px] items-center gap-[13px] rounded-[20px] border px-[17px] transition-all border-border bg-card">
              <Search className="h-[15px] w-[15px] text-foreground/50" />
              <Input
                id="search-delegates-global"
                name="search-delegates"
                placeholder="Search by ENS or address"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-full flex-1 appearance-none bg-transparent outline-hidden border-none focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
              />
            </div>
          </div>
          <div className="flex flex-col lg:flex-row lg:items-start gap-[15px] lg:gap-[10px]">
            <div className="flex-1">
              <ResponsiveRenderer
                desktop={
                  <MembersTable
                    onDelegate={handleDelegate}
                    searchTerm={debouncedSearchTerm}
                    orderBy={queryOrderBy}
                    hasUserSorted={hasUserSorted}
                    sortState={sortState}
                    onPowerSortChange={handlePowerSortChange}
                    onLastVotedSortChange={handleLastVotedSortChange}
                    onDelegatorsSortChange={handleDelegatorsSortChange}
                  />
                }
                mobile={
                  <MembersList
                    onDelegate={handleDelegate}
                    searchTerm={debouncedSearchTerm}
                    orderBy={queryOrderBy}
                    hasUserSorted={hasUserSorted}
                  />
                }
                loadingFallback={
                  <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div key={index} className="rounded-[14px] bg-card p-4">
                        <Skeleton className="h-6 w-3/4 mb-2" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    ))}
                  </div>
                }
              />
            </div>
            <div className="w-[360px] flex-col gap-[15px] lg:gap-[20px] hidden lg:flex">
              <SystemInfo />
              <Faqs type="delegate" />
            </div>
          </div>
        </div>
      </WithConnect>
    );
  }

  return (
    <div className="flex flex-col gap-[15px] lg:gap-[20px]">
      <div className="flex flex-col lg:flex-row lg:items-start gap-[15px] lg:gap-[20px]">
        <div className="flex-1 flex flex-col gap-[15px] lg:gap-[20px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-[10px] sm:gap-[20px]">
            <h3 className="text-[16px] lg:text-[18px] font-extrabold">
              {getDisplayTitle()}
            </h3>
            <div className="flex h-[36px] w-full sm:w-[388px] items-center gap-[13px] rounded-[20px] border px-[17px] transition-all border-gray-1 bg-card">
              <Search className="h-[15px] w-[15px] text-foreground/50" />
              <Input
                id="search-delegates-main"
                name="search-delegates"
                placeholder="Search by ENS or address"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-full flex-1 appearance-none bg-transparent outline-hidden border-none focus-visible:ring-0 focus-visible:ring-offset-0 p-0 placeholder:text-foreground/50 placeholder:text-[14px] placeholder:font-normal"
              />
            </div>
          </div>
          <ResponsiveRenderer
            desktop={
              <MembersTable
                onDelegate={handleDelegate}
                searchTerm={debouncedSearchTerm}
                orderBy={queryOrderBy}
                hasUserSorted={hasUserSorted}
                sortState={sortState}
                onPowerSortChange={handlePowerSortChange}
                onLastVotedSortChange={handleLastVotedSortChange}
                onDelegatorsSortChange={handleDelegatorsSortChange}
              />
            }
            mobile={
              <MembersList
                onDelegate={handleDelegate}
                searchTerm={debouncedSearchTerm}
                orderBy={queryOrderBy}
                hasUserSorted={hasUserSorted}
              />
            }
            loadingFallback={
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="rounded-[14px] bg-card p-4">
                    <Skeleton className="h-6 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))}
              </div>
            }
          />
        </div>
        <div className="w-[360px] flex-col gap-[15px] lg:gap-[20px] hidden lg:flex">
          <SystemInfo />
          <Faqs type="delegate" />
        </div>
      </div>
      <DelegateAction address={address} open={open} onOpenChange={setOpen} />
    </div>
  );
}
