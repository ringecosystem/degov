import { useMemo } from "react";

import type { Member } from "@/services/graphql/types";

import { AddressWithAvatar } from "../address-with-avatar";
import { CustomTable } from "../custom-table";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

import { useMembersData } from "./hooks/useMembersData";

import type { ColumnType } from "../custom-table";

interface MembersTableProps {
  onDelegate?: (value: Member) => void;
  pageSize?: number;
}

export function MembersTable({ onDelegate, pageSize = 10 }: MembersTableProps) {
  const {
    state: { data: members, hasNextPage, isPending, isFetchingNextPage },
    votingPowerState: { data: votingPowerMap, isLoading: isVotingPowerLoading },
    loadMoreData,
  } = useMembersData(pageSize);

  const columns = useMemo<ColumnType<Member>[]>(
    () => [
      {
        title: "Rank",
        key: "rank",
        width: "160px",
        className: "text-left",
        render: (_record, index) => (
          <span className="line-clamp-1" title={(index + 1).toString()}>
            {index + 1}
          </span>
        ),
      },
      {
        title: "Member",
        key: "member",
        width: "260px",
        className: "text-left",
        render: (record) => (
          <AddressWithAvatar address={record.address as `0x${string}`} />
        ),
      },
      {
        title: "Delegate Statement",
        key: "delegateStatement",
        width: "200px",
        className: "text-left",
        render: (record) => (
          <span className="line-clamp-1" title={record.delegate_statement}>
            {record.delegate_statement || "-"}
          </span>
        ),
      },
      {
        title: "Voting Power",
        key: "votingPower",
        width: "200px",
        className: "text-right",
        render: (record) =>
          isVotingPowerLoading ? (
            <Skeleton className="h-[30px] w-[100px]" />
          ) : (
            <span
              className="line-clamp-1"
              title={votingPowerMap[record.address.toLowerCase()]?.formatted}
            >
              {votingPowerMap[record.address.toLowerCase()]?.formatted || "0"}
            </span>
          ),
      },
      {
        title: "Action",
        key: "action",
        width: "180px",
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
    [onDelegate, votingPowerMap, isVotingPowerLoading]
  );

  return (
    <div className="rounded-[14px] bg-card p-[20px]">
      <CustomTable
        tableClassName="table-fixed"
        columns={columns}
        dataSource={members}
        rowKey="id"
        isLoading={isPending || isVotingPowerLoading}
        emptyText="No Members"
        caption={
          hasNextPage ? (
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
