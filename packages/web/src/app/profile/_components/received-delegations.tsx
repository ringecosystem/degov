import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { DelegationList } from "@/components/delegation-list";
import { DelegationTable } from "@/components/delegation-table";
import type {
  DelegationSortDirection,
  DelegationSortField,
  DelegationSortState,
} from "@/components/delegation-table";
import { ResponsiveRenderer } from "@/components/responsive-renderer";
import { Skeleton } from "@/components/ui/skeleton";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { delegateService } from "@/services/graphql";

import type { Address } from "viem";

interface ReceivedDelegationsProps {
  address: Address;
}

const DEFAULT_SORT_STATE: DelegationSortState = {
  field: "date",
  direction: "desc",
};

const ORDER_BY_MAP: Record<
  DelegationSortField,
  Record<DelegationSortDirection, string>
> = {
  date: {
    asc: "blockTimestamp_ASC_NULLS_LAST",
    desc: "blockTimestamp_DESC_NULLS_LAST",
  },
  power: {
    asc: "power_ASC",
    desc: "power_DESC",
  },
};

export function ReceivedDelegations({ address }: ReceivedDelegationsProps) {
  const daoConfig = useDaoConfig();
  const [sortState, setSortState] =
    useState<DelegationSortState>(DEFAULT_SORT_STATE);

  // Get received delegations count
  const { data: delegationConnection } = useQuery({
    queryKey: ["delegatesConnection", address, daoConfig?.indexer?.endpoint],
    queryFn: () =>
      delegateService.getDelegateMappingsConnection(
        daoConfig?.indexer?.endpoint as string,
        {
          where: {
            toDelegate_eq: address.toLowerCase(),
          },
          orderBy: ["id_ASC"],
        }
      ),
    enabled: !!daoConfig?.indexer?.endpoint && !!address,
  });

  const getDisplayTitle = () => {
    const totalCount = delegationConnection?.totalCount;
    if (totalCount !== undefined) {
      return `Received Delegations (${totalCount})`;
    }
    return "Received Delegations";
  };

  const orderBy = ORDER_BY_MAP[sortState.field][sortState.direction];

  const applySortState = (
    field: DelegationSortField,
    direction?: DelegationSortDirection
  ) => {
    if (!direction) {
      setSortState(DEFAULT_SORT_STATE);
      return;
    }

    setSortState({ field, direction });
  };

  const handleDateSortChange = (direction?: DelegationSortDirection) =>
    applySortState("date", direction);

  const handlePowerSortChange = (direction?: DelegationSortDirection) =>
    applySortState("power", direction);

  return (
    <div className="flex flex-col gap-[15px] lg:gap-[20px]">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <h3 className="text-[16px] lg:text-[18px] font-semibold">
          {getDisplayTitle()}
        </h3>
      </div>
      <ResponsiveRenderer
        desktop={
          <DelegationTable
            address={address}
            orderBy={orderBy}
            totalCount={delegationConnection?.totalCount ?? 0}
            sortState={sortState}
            onDateSortChange={handleDateSortChange}
            onPowerSortChange={handlePowerSortChange}
          />
        }
        mobile={
          <DelegationList
            address={address}
            orderBy={orderBy}
            totalCount={delegationConnection?.totalCount ?? 0}
          />
        }
        loadingFallback={
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-[14px] bg-card p-4">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        }
      />
    </div>
  );
}
