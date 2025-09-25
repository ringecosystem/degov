import { useMemo } from "react";

import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import { useVotingPowerAgainstQuorum } from "@/hooks/useVotingPowerAgainstQuorum";
import type { DelegateItem } from "@/services/graphql/types";
import { formatTimeAgo } from "@/utils/date";

import { AddressWithAvatar } from "../address-with-avatar";
import { CustomTable } from "../custom-table";
import { Skeleton } from "../ui/skeleton";

import { useDelegationData } from "./hooks/usedelegationData";

import type { ColumnType } from "../custom-table";
import type { Address } from "viem";

interface DelegationTableProps {
  address: Address;
}

export function DelegationTable({ address }: DelegationTableProps) {
  const formatTokenAmount = useFormatGovernanceTokenAmount();
  const { state, loadMoreData } = useDelegationData(address);

  const { calculatePercentage, isLoading: isQuorumLoading } =
    useVotingPowerAgainstQuorum();

  const columns = useMemo<ColumnType<DelegateItem>[]>(
    () => [
      {
        title: "Delegator",
        key: "delegator",
        width: "33%",
        className: "text-left",
        render: (record) => (
          <AddressWithAvatar
            address={record?.fromDelegate as `0x${string}`}
            avatarSize={30}
            align="start"
          />
        ),
      },
      {
        title: "Date",
        key: "date",
        width: "33%",
        className: "text-center",
        render: (record) => {
          const timeAgo = formatTimeAgo(record.blockTimestamp);

          return <span className="text-[14px]">{timeAgo || "-"}</span>;
        },
      },
      {
        title: "Votes",
        key: "votes",
        width: "33%",
        className: "text-right",
        render: (record) => {
          return (
            <DelegatorVotesDisplay
              record={record}
              formatTokenAmount={formatTokenAmount}
              calculatePercentage={calculatePercentage}
              isQuorumLoading={isQuorumLoading}
            />
          );
        },
      },
    ],
    [formatTokenAmount, calculatePercentage, isQuorumLoading]
  );

  return (
    <div className="rounded-[14px] bg-card p-[20px] shadow-card">
      <CustomTable
        dataSource={state.data}
        columns={columns}
        isLoading={state.isPending}
        emptyText={<span>No delegations yet</span>}
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

interface DelegatorVotesDisplayProps {
  record: DelegateItem;
  formatTokenAmount: (amount: bigint) => { formatted: string } | undefined;
  calculatePercentage: (power?: bigint | null) => number;
  isQuorumLoading: boolean;
}

function DelegatorVotesDisplay({
  record,
  formatTokenAmount,
  calculatePercentage,
  isQuorumLoading,
}: DelegatorVotesDisplayProps) {
  const userPower = record?.power ? BigInt(record.power) : 0n;
  const formattedAmount = formatTokenAmount(userPower);

  if (isQuorumLoading || !formattedAmount) {
    return <Skeleton className="h-[30px] w-full" />;
  }

  const percentage = calculatePercentage(userPower);

  return (
    <div className="text-right flex items-center justify-end gap-[5px]">
      <div className="text-[14px]" title={formattedAmount?.formatted}>
        {formattedAmount?.formatted}
      </div>
      <div>({percentage.toFixed(2)}%)</div>
    </div>
  );
}
