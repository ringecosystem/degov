import { useMemo } from "react";
import { useReadContract } from "wagmi";

import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { abi as tokenAbi } from "@/config/abi/token";
import type { DelegateItem } from "@/services/graphql/types";

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
  const daoConfig = useDaoConfig();
  const tokenAddress = daoConfig?.contracts?.governorToken?.address as Address;

  const { data: totalVotes } = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "getVotes",
    args: [address],
    chainId: daoConfig?.chain?.id,
    query: {
      enabled:
        Boolean(address) &&
        Boolean(tokenAddress) &&
        Boolean(daoConfig?.chain?.id),
    },
  });

  const columns = useMemo<ColumnType<DelegateItem>[]>(
    () => [
      {
        title: "Delegator",
        key: "delegator",
        width: "70%",
        className: "text-left",
        render: (record) => (
          <AddressWithAvatar
            address={record?.fromDelegate as `0x${string}`}
            avatarSize={30}
          />
        ),
      },
      {
        title: "Votes",
        key: "votes",
        width: "30%",
        className: "text-right",
        render: (record) => {
          return (
            <DelegatorVotesDisplay
              record={record}
              formatTokenAmount={formatTokenAmount}
              totalVotes={totalVotes || 0n}
            />
          );
        },
      },
    ],
    [formatTokenAmount]
  );

  return (
    <div className="rounded-[14px] bg-card p-[20px]">
      <CustomTable
        dataSource={state.data}
        columns={columns}
        isLoading={state.isPending}
        emptyText={<span>You haven&#39;t received any delegation yet.</span>}
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
  totalVotes: bigint;
}

function DelegatorVotesDisplay({
  record,
  formatTokenAmount,
  totalVotes,
}: DelegatorVotesDisplayProps) {
  const userPower = record?.power ? BigInt(record.power) : 0n;
  const formattedAmount = formatTokenAmount(userPower);

  const percentage =
    totalVotes > 0n ? Number((userPower * 10000n) / totalVotes) / 100 : 0;

  return (
    <div className="text-right flex items-center justify-end gap-[5px]">
      <div className="text-[14px]" title={formattedAmount?.formatted}>
        {formattedAmount?.formatted}
      </div>
      <div>({percentage.toFixed(1)}%)</div>
    </div>
  );
}
