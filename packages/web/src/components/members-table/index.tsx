import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { DEFAULT_PAGE_SIZE } from "@/config/base";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import { proposalService } from "@/services/graphql";
import type { ContributorItem } from "@/services/graphql/types";
import { formatTimeAgo } from "@/utils/date";

import { AddressWithAvatar } from "../address-with-avatar";
import { CustomTable } from "../custom-table";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

import { useBotMemberData } from "./hooks/useBotMemberData";
import { useMembersData } from "./hooks/useMembersData";

import type { ColumnType } from "../custom-table";

interface MembersTableProps {
  onDelegate?: (value: ContributorItem) => void;
  pageSize?: number;
  searchTerm?: string;
}

export function MembersTable({
  onDelegate,
  pageSize = DEFAULT_PAGE_SIZE,
  searchTerm = "",
}: MembersTableProps) {
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

  const columns = useMemo<ColumnType<ContributorItem>[]>(
    () => [
      {
        title: "Name",
        key: "name",
        width: "200px",
        className: "text-left",
        render: (record) => (
          <AddressWithAvatar address={record?.id as `0x${string}`} />
        ),
      },
      {
        title: "Voting Power",
        key: "votingPower",
        width: "180px",
        className: "text-center",
        render: (record) => {
          if (isProfilePullLoading || isProposalMetricsLoading) {
            return <Skeleton className="h-[30px] w-full" />;
          }

          const userPower = record?.power ? BigInt(record.power) : 0n;
          const totalPower = dataMetrics?.powerSum
            ? BigInt(dataMetrics.powerSum)
            : 0n;

          const formattedAmount = formatTokenAmount(userPower);
          const percentage =
            totalPower > 0n
              ? Number((userPower * 10000n) / totalPower) / 100
              : 0;

          return (
            <div className="flex items-center justify-center gap-[5px]">
              <div className="text-[14px]" title={formattedAmount?.formatted}>
                {formattedAmount?.formatted}
              </div>
              <div>({percentage.toFixed(2)}%)</div>
            </div>
          );
        },
      },
      {
        title: "Last Voted",
        key: "lastVoted",
        width: "150px",
        className: "text-center",
        render: (record) => {
          if (!record?.blockTimestamp) {
            return (
              <span className="text-muted-foreground text-sm">
                No Vote History
              </span>
            );
          }

          return (
            <span className="text-sm">
              {formatTimeAgo(record.blockTimestamp)}
            </span>
          );
        },
      },
      {
        title: "Action",
        key: "action",
        width: "140px",
        className: "text-right",
        render: (record) => (
          <Button
            variant="outline"
            onClick={() => {
              onDelegate?.(record);
            }}
            className="h-[30px] rounded-[100px] border border-border bg-card p-[10px]"
          >
            Delegate
          </Button>
        ),
      },
    ],
    [
      onDelegate,
      isProfilePullLoading,
      formatTokenAmount,
      dataMetrics,
      isProposalMetricsLoading,
    ]
  );

  return (
    <div className="rounded-[14px] bg-card p-[20px] shadow-card">
      <CustomTable
        tableClassName="table-fixed"
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        isLoading={isPending}
        emptyText={searchTerm ? "No matching delegates found" : "No Delegates"}
        caption={
          hasNextPage && !searchTerm ? (
            <div
              className="text-foreground transition-colors hover:text-foreground/80 cursor-pointer"
              onClick={loadMoreData}
            >
              {isFetchingNextPage ? "Loading more..." : "View more"}
            </div>
          ) : null
        }
      />
    </div>
  );
}
