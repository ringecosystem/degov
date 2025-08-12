
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import type { DelegateItem } from "@/services/graphql/types";

import { AddressAvatar } from "../address-avatar";
import { AddressResolver } from "../address-resolver";
import { useDelegationData } from "../delegation-table/hooks/usedelegationData";
import { Skeleton } from "../ui/skeleton";

import type { Address } from "viem";

interface DelegationListProps {
  address: Address;
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
        {isLoading ? "Loading..." : "View More"}
      </button>
    </div>
  );
};

export function DelegationList({ address }: DelegationListProps) {
  const formatTokenAmount = useFormatGovernanceTokenAmount();
  const { state, loadMoreData } = useDelegationData(address);

  if (state.isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[14px] bg-card p-[10px] border border-border/20"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
              <div className="flex flex-col items-end flex-shrink-0">
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!state.data || state.data.length === 0) {
    return (
      <div className="rounded-[14px] bg-card p-[20px] text-center text-muted-foreground">
        No delegations yet
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {state.data.map((record: DelegateItem) => {
        const userPower = record?.power ? BigInt(record.power) : 0n;
        const formattedAmount = formatTokenAmount(userPower);

        return (
          <div
            key={record.id}
            className="rounded-[14px] bg-card p-[10px] border border-border/20"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <AddressAvatar
                  address={record?.fromDelegate as `0x${string}`}
                  size={40}
                />
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <AddressResolver
                    address={record?.fromDelegate as `0x${string}`}
                    showShortAddress
                  >
                    {(value) => (
                      <span className="text-sm font-medium text-foreground truncate">
                        {value}
                      </span>
                    )}
                  </AddressResolver>
                </div>
              </div>

              <div className="flex flex-col items-end flex-shrink-0">
                <div className="text-sm font-medium text-foreground">
                  {formattedAmount?.formatted}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {state.hasNextPage && (
        <Caption
          loadMoreData={loadMoreData}
          isLoading={state.isFetchingNextPage}
        />
      )}
    </div>
  );
}
