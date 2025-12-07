import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { DEFAULT_PAGE_SIZE, INITIAL_LIST_PAGE_SIZE } from "@/config/base";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import { proposalService } from "@/services/graphql";
import type { ContributorItem } from "@/services/graphql/types";
import { formatTimeAgo } from "@/utils/date";
import { formatInteger } from "@/utils/number";

import { AddressWithAvatar } from "../address-with-avatar";
import { CustomTable } from "../custom-table";
import { SortableCell } from "../sortable-cell";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

import { useBotMemberData } from "./hooks/useBotMemberData";
import { useMembersData } from "./hooks/useMembersData";

import type { ColumnType } from "../custom-table";
import type { MemberSortDirection, MemberSortState } from "./types";

interface MembersTableProps {
  onDelegate?: (value: ContributorItem) => void;
  pageSize?: number;
  searchTerm?: string;
  orderBy?: string;
  sortState: MemberSortState;
  hasUserSorted: boolean;
  onPowerSortChange: (direction?: MemberSortDirection) => void;
  onLastVotedSortChange: (direction?: MemberSortDirection) => void;
  onDelegatorsSortChange: (direction?: MemberSortDirection) => void;
}

export function MembersTable({
  onDelegate,
  pageSize = DEFAULT_PAGE_SIZE,
  searchTerm = "",
  orderBy,
  sortState,
  hasUserSorted,
  onPowerSortChange,
  onLastVotedSortChange,
  onDelegatorsSortChange,
}: MembersTableProps) {
  const daoConfig = useDaoConfig();
  const formatTokenAmount = useFormatGovernanceTokenAmount();

  const { data: dataMetrics, isLoading: isProposalMetricsLoading } = useQuery({
    queryKey: ["dataMetrics", daoConfig?.indexer?.endpoint],
    queryFn: () =>
      proposalService.getProposalMetrics(daoConfig?.indexer?.endpoint ?? ""),
    enabled: !!daoConfig?.indexer?.endpoint,
  });
  const initialPageSize =
    pageSize === DEFAULT_PAGE_SIZE ? INITIAL_LIST_PAGE_SIZE : pageSize;

  const {
    state: { data: members, hasNextPage, isPending, isFetchingNextPage },
    profilePullState: { isLoading: isProfilePullLoading },
    loadMoreData,
  } = useMembersData(
    pageSize,
    searchTerm,
    initialPageSize,
    orderBy,
    hasUserSorted
  );

  // Fetch AI bot contributor data separately and prepend when available (only on the first page)
  const { data: botMember } = useBotMemberData();

  const shouldPrependBot = !hasUserSorted && !searchTerm && !!botMember;
  const dataSource: ContributorItem[] = shouldPrependBot
    ? [botMember, ...members.filter((member) => member.id !== botMember.id)]
    : members;

  const columns = useMemo<ColumnType<ContributorItem>[]>(
    () => [
      {
        title: "Name",
        key: "name",
        width: "236.6px",
        className: "text-left",
        render: (record) => (
          <AddressWithAvatar address={record?.id as `0x${string}`} />
        ),
      },
      {
        title: (
          <SortableCell
            label="Voting Power"
            sortState={
              sortState.field === "power" ? sortState.direction : undefined
            }
            onClick={onPowerSortChange}
            className="justify-start"
            textClassName="text-[14px]"
          />
        ),
        key: "votingPower",
        width: "215.26px",
        className: "text-left",
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
            <div className="flex items-center justify-start gap-[5px]">
              <div className="text-[14px]" title={formattedAmount?.formatted}>
                {formattedAmount?.formatted}
              </div>
              <div>({percentage.toFixed(2)}%)</div>
            </div>
          );
        },
      },
      {
        title: (
          <SortableCell
            label="Last Voted"
            sortState={
              sortState.field === "lastVoted" ? sortState.direction : undefined
            }
            onClick={onLastVotedSortChange}
            className="justify-start"
            textClassName="text-[14px]"
          />
        ),
        key: "lastVoted",
        width: "215.26px",
        className: "text-left",
        render: (record) => {
          if (!record?.lastVoteTimestamp) {
            return (
              <span className="text-muted-foreground text-sm">
                No Vote History
              </span>
            );
          }

          return (
            <span className="text-sm">
              {formatTimeAgo(record.lastVoteTimestamp)}
            </span>
          );
        },
      },
      {
        title: (
          <SortableCell
            label="Delegators"
            sortState={
              sortState.field === "delegators" ? sortState.direction : undefined
            }
            onClick={onDelegatorsSortChange}
            className="justify-start"
            textClassName="text-[14px]"
          />
        ),
        key: "delegators",
        width: "108.6px",
        className: "text-left",
        render: (record) => (
          <span className="text-[14px] block py-[10px]">
            {formatInteger(record?.delegatesCountAll)}
          </span>
        ),
      },
      {
        title: "Action",
        key: "action",
        width: "215.26px",
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
      sortState,
      onPowerSortChange,
      onLastVotedSortChange,
      onDelegatorsSortChange,
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

export { DEFAULT_SORT_STATE } from "./types";
export type {
  MemberSortField,
  MemberSortDirection,
  MemberSortState,
} from "./types";
