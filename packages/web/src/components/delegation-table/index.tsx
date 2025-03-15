import { useMemo } from "react";

import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import type { DelegateItem } from "@/services/graphql/types";
import { formatTimestampToFriendlyDate } from "@/utils/date";

import { AddressWithAvatar } from "../address-with-avatar";
import { CustomTable } from "../custom-table";

import { useDelegationData } from "./hooks/usedelegationData";

import type { ColumnType } from "../custom-table";
import type { Address } from "viem";

interface DelegationTableProps {
  address: Address;
}
export function DelegationTable({ address }: DelegationTableProps) {
  const formatTokenAmount = useFormatGovernanceTokenAmount();
  const { state, loadMoreData } = useDelegationData(address);

  const columns = useMemo<ColumnType<DelegateItem>[]>(
    () => [
      {
        title: "Delegator",
        key: "delegator",
        width: "33.3%",
        render: (record) => (
          <AddressWithAvatar
            address={record?.fromDelegate as `0x${string}`}
            avatarSize={30}
          />
        ),
      },
      {
        title: "Delegation Date",
        key: "delegationDate",
        width: "33.3%",
        render: (record) =>
          formatTimestampToFriendlyDate(record.blockTimestamp),
      },
      {
        title: "Votes",
        key: "votes",
        width: "33.3%",
        render: (record) => {
          return formatTokenAmount(record?.power ? BigInt(record?.power) : 0n)
            .formatted;
        },
      },
    ],
    [formatTokenAmount]
  );
  return (
    <div className="rounded-[14px] bg-card p-[20px]">
      <CustomTable
        dataSource={state.data}
        columns={columns as ColumnType<DelegateItem>[]}
        isLoading={state.isPending}
        emptyText={
          <span>
            You haven&apos;t received delegations from others, and you can
            delegate to yourself or others{" "}
            <a href="/members" className="font-semibold underline">
              here
            </a>
            .
          </span>
        }
        rowKey="id"
        caption={
          state.hasNextPage && (
            <div className="flex justify-center items-center">
              {
                <button
                  onClick={loadMoreData}
                  className="text-foreground transition-colors hover:text-foreground/80 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={state.isFetchingNextPage}
                >
                  {state.isFetchingNextPage ? "Loading..." : "View more"}
                </button>
              }
            </div>
          )
        }
      />
    </div>
  );
}
