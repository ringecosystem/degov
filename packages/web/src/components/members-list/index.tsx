import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";

import { DEFAULT_PAGE_SIZE } from "@/config/base";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import { proposalService } from "@/services/graphql";
import type { ContributorItem } from "@/services/graphql/types";

import { AddressAvatar } from "../address-avatar";
import { AddressResolver } from "../address-resolver";
import { useBotMemberData } from "../members-table/hooks/useBotMemberData";
import { useMembersData } from "../members-table/hooks/useMembersData";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

interface MembersListProps {
  onDelegate?: (value: ContributorItem) => void;
  pageSize?: number;
  searchTerm?: string;
}

const Caption = ({
  loadMoreData,
  isLoading,
}: {
  loadMoreData: () => void;
  isLoading: boolean;
}) => {
  return (
    <div className="flex justify-center items-center w-full border border-border/20 bg-card rounded-[14px] px-4 py-2">
      <button
        onClick={loadMoreData}
        className="text-foreground transition-colors hover:text-foreground/80 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isLoading}
      >
        {isLoading ? "Loading..." : "View more"}
      </button>
    </div>
  );
};

export function MembersList({
  onDelegate,
  pageSize = DEFAULT_PAGE_SIZE,
  searchTerm = "",
}: MembersListProps) {
  const daoConfig = useDaoConfig();
  const formatTokenAmount = useFormatGovernanceTokenAmount();

  const { data: dataMetrics, isLoading: isProposalMetricsLoading } = useQuery({
    queryKey: ["dataMetrics", daoConfig?.indexer?.endpoint],
    queryFn: () =>
      proposalService.getProposalMetrics(daoConfig?.indexer?.endpoint ?? ""),
    enabled: !!daoConfig?.indexer?.endpoint,
  });

  const {
    state: { data: members, hasNextPage, isPending, isFetchingNextPage },
    profilePullState: { isLoading: isProfilePullLoading },
    loadMoreData,
  } = useMembersData(pageSize, searchTerm);

  // Fetch AI bot contributor data separately and prepend when available (only on the first page)
  const { data: botMember } = useBotMemberData();

  const dataSource = useMemo<ContributorItem[]>(() => {
    // When searching, return members as-is (already filtered by API)
    if (searchTerm) {
      return members;
    }

    // When not searching, prepend bot member if available
    if (botMember) {
      const withoutBot = members.filter((m) => m.id !== botMember.id);
      return [botMember, ...withoutBot];
    }

    return members;
  }, [botMember, members, searchTerm]);

  if (isPending) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[14px] bg-card p-4 border border-border/20"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (dataSource.length === 0) {
    return (
      <div className="rounded-[14px] bg-card p-[20px] text-center text-foreground/60">
        {searchTerm ? "No matching delegates found" : "No Delegates"}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dataSource.map((record) => {
        const userPower = record?.power ? BigInt(record.power) : 0n;
        const totalPower = dataMetrics?.powerSum
          ? BigInt(dataMetrics.powerSum)
          : 0n;
        const formattedAmount = formatTokenAmount(userPower);
        const percentage =
          totalPower > 0n ? Number((userPower * 10000n) / totalPower) / 100 : 0;

        return (
          <div
            key={record.id}
            className="rounded-[14px] bg-card p-[10px] border border-border/20"
          >
            <div className="flex items-center gap-3">
              <AddressAvatar address={record?.id as `0x${string}`} size={30} />
              <div className="flex items-start justify-start flex-col flex-1 min-w-0">
                <Link
                  href={`/delegate/${record?.id as `0x${string}`}`}
                  target={undefined}
                  rel={undefined}
                >
                  <AddressResolver
                    address={record?.id as `0x${string}`}
                    showShortAddress
                  >
                    {(ensName) => (
                      <span className="line-clamp-1 font-mono hover:underline">
                        {ensName}
                      </span>
                    )}
                  </AddressResolver>
                </Link>
                <div className="text-left">
                  {isProfilePullLoading || isProposalMetricsLoading ? (
                    <Skeleton className="h-4 w-20" />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm font-semibold text-muted-foreground"
                        title={formattedAmount?.formatted}
                      >
                        {formattedAmount?.formatted}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        ({percentage.toFixed(2)}%)
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => onDelegate?.(record)}
                className="h-8 rounded-full border border-border bg-card px-4 text-sm"
              >
                Delegate
              </Button>
            </div>
          </div>
        );
      })}

      {hasNextPage && !searchTerm && (
        <Caption loadMoreData={loadMoreData} isLoading={isFetchingNextPage} />
      )}
    </div>
  );
}
