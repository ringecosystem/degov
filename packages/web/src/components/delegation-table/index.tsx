import { useEffect, useMemo } from "react";

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
  console.log(address);

  const formatTokenAmount = useFormatGovernanceTokenAmount();
  const { state, loadMoreData, loadInitialData } = useDelegationData(address);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const columns = useMemo<ColumnType<DelegateItem>[]>(
    () => [
      {
        title: "Delegator",
        key: "delegator",
        width: "33.3%",
        render: (record) => (
          <AddressWithAvatar
            address={record.delegator as `0x${string}`}
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
          const toNewVotes = record?.toNewVotes
            ? BigInt(record?.toNewVotes)
            : 0n;
          const toPreviousVotes = record?.toPreviousVotes
            ? BigInt(record?.toPreviousVotes)
            : 0n;
          const votes = toNewVotes - toPreviousVotes;
          return formatTokenAmount(votes).formatted;
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
        isLoading={state.isFetching}
        emptyText={
          <span>
            You haven&apos;t received delegations from others, and you can
            delegate to yourself or others{" "}
            <a href="/delegate" className="font-semibold underline">
              here
            </a>
            .
          </span>
        }
        rowKey="id"
        caption={
          <div className="flex justify-center items-center">
            {state.data.length >= 10 * state.currentPage && (
              <button
                onClick={loadMoreData}
                className="text-foreground transition-colors hover:text-foreground/80 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={state.isFetching}
              >
                {state.isFetching ? "Loading..." : "Load More"}
              </button>
            )}
          </div>
        }
      />
    </div>
  );
}
