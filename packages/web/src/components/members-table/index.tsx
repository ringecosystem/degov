import { useMemo } from "react";

import { DEFAULT_PAGE_SIZE } from "@/config/base";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import type { ContributorItem } from "@/services/graphql/types";

import { AddressWithAvatar } from "../address-with-avatar";
import { CustomTable } from "../custom-table";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

import { useMembersData } from "./hooks/useMembersData";

import type { ColumnType } from "../custom-table";
interface MembersTableProps {
  onDelegate?: (value: ContributorItem) => void;
  pageSize?: number;
}

export function MembersTable({
  onDelegate,
  pageSize = DEFAULT_PAGE_SIZE,
}: MembersTableProps) {
  const formatTokenAmount = useFormatGovernanceTokenAmount();

  const {
    state: { data: members, hasNextPage, isPending, isFetchingNextPage },
    profilePullState: {
      data: profilePullData,
      isLoading: isProfilePullLoading,
    },
    loadMoreData,
  } = useMembersData(pageSize);

  const columns = useMemo<ColumnType<ContributorItem>[]>(
    () => [
      {
        title: "Rank",
        key: "rank",
        width: "70px",
        className: "text-left",
        render: (_record, index) => (
          <span className="line-clamp-1" title={(index + 1).toString()}>
            {index + 1}
          </span>
        ),
      },
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
        title: "Delegate Statement",
        key: "delegateStatement",
        width: "470px",
        className: "text-left",
        render: (record) => {
          if (!profilePullData?.[record.id]?.delegate_statement) {
            return "-";
          }

          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="line-clamp-1 break-words">
                  {profilePullData?.[record.id]?.delegate_statement || "-"}
                </span>
              </TooltipTrigger>
              <TooltipContent
                className="w-[300px]"
                style={{
                  wordBreak: "break-word",
                }}
              >
                {profilePullData?.[record.id]?.delegate_statement || "-"}
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        title: "Voting Power",
        key: "votingPower",
        width: "120px",
        className: "text-right",
        render: (record) =>
          isProfilePullLoading ? (
            <Skeleton className="h-[30px] w-[100px]" />
          ) : (
            <span
              className="line-clamp-1"
              title={
                formatTokenAmount(record?.power ? BigInt(record?.power) : 0n)
                  ?.formatted
              }
            >
              {
                formatTokenAmount(record?.power ? BigInt(record?.power) : 0n)
                  ?.formatted
              }
            </span>
          ),
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
    [onDelegate, profilePullData, isProfilePullLoading, formatTokenAmount]
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
