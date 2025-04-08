import { useMemo } from "react";

import { DEFAULT_PAGE_SIZE } from "@/config/base";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import type { Member } from "@/services/graphql/types";

import { AddressWithAvatar } from "../address-with-avatar";
import { CustomTable } from "../custom-table";
import { Button } from "../ui/button";

import { useMembersData } from "./hooks/useMembersData";

import type { ColumnType } from "../custom-table";

interface MembersTableProps {
  onDelegate?: (value: Member) => void;
  pageSize?: number;
}

export function MembersTable({
  onDelegate,
  pageSize = DEFAULT_PAGE_SIZE,
}: MembersTableProps) {
  const formatTokenAmount = useFormatGovernanceTokenAmount();

  const {
    state: { data: members, hasNextPage, isPending, isFetchingNextPage },
    loadMoreData,
  } = useMembersData(pageSize);

  const columns = useMemo<ColumnType<Member>[]>(
    () => [
      {
        title: "Rank",
        key: "rank",
        width: "100px",
        className: "text-left",
        render: (record) => (
          <span className="line-clamp-1" title={record?.rn?.toString()}>
            {record?.rn}
          </span>
        ),
      },
      {
        title: "Name",
        key: "name",
        width: "260px",
        className: "text-left",
        render: (record) => (
          <AddressWithAvatar address={record?.address as `0x${string}`} />
        ),
      },
      {
        title: "Delegate Statement",
        key: "delegateStatement",
        width: "260px",
        className: "text-left",
        render: (record) => (
          <span
            className="line-clamp-1 break-words"
            title={record?.delegate_statement || "-"}
          >
            {record?.delegate_statement || "-"}
          </span>
        ),
      },
      {
        title: "Voting Power",
        key: "votingPower",
        width: "200px",
        className: "text-right",
        render: (record) => {
          const power = record?.power ? BigInt(record?.power) : 0n;
          return (
            <span
              className="line-clamp-1"
              title={formatTokenAmount(power)?.formatted}
            >
              {formatTokenAmount(power)?.formatted}
            </span>
          );
        },
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
    [onDelegate, formatTokenAmount]
  );

  return (
    <div className="rounded-[14px] bg-card p-[20px]">
      <CustomTable
        tableClassName="table-fixed"
        columns={columns}
        dataSource={members}
        rowKey="id"
        isLoading={isPending}
        emptyText="No Delegates"
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
