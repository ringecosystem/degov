import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { DelegationList } from "@/components/delegation-list";
import { DelegationTable } from "@/components/delegation-table";
import type {
  DelegationSortDirection,
  DelegationSortField,
  DelegationSortState,
} from "@/components/delegation-table";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useDeviceDetection } from "@/hooks/useDeviceDetection";
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
  const { isDesktop, isClient } = useDeviceDetection();
  const shouldRenderList = !isClient || !isDesktop;
  const shouldRenderTable = !isClient || isDesktop;

  // Get received delegations count
  const { data: delegationConnection } = useQuery({
    queryKey: [
      "delegateMappingsConnection",
      address,
      daoConfig?.indexer?.endpoint,
    ],
    queryFn: () =>
      delegateService.getDelegateMappingsConnection(
        daoConfig?.indexer?.endpoint as string,
        {
          where: {
            to_eq: address.toLowerCase(),
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

  const orderBy = useMemo(() => {
    return ORDER_BY_MAP[sortState.field][sortState.direction];
  }, [sortState]);

  const applySortState = useCallback(
    (field: DelegationSortField, direction?: DelegationSortDirection) => {
      if (!direction) {
        setSortState(DEFAULT_SORT_STATE);
        return;
      }

      setSortState({ field, direction });
    },
    []
  );

  const handleDateSortChange = useCallback(
    (direction?: DelegationSortDirection) => applySortState("date", direction),
    [applySortState]
  );

  const handlePowerSortChange = useCallback(
    (direction?: DelegationSortDirection) => applySortState("power", direction),
    [applySortState]
  );

  return (
    <div className="flex flex-col gap-[15px] lg:gap-[20px]">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <h3 className="text-[16px] lg:text-[18px] font-semibold">
          {getDisplayTitle()}
        </h3>
      </div>
      {shouldRenderList ? (
        <div className="lg:hidden">
          <DelegationList
            address={address}
            orderBy={orderBy}
            totalCount={delegationConnection?.totalCount ?? 0}
          />
        </div>
      ) : null}
      {shouldRenderTable ? (
        <div className="hidden lg:block">
          <DelegationTable
            address={address}
            orderBy={orderBy}
            totalCount={delegationConnection?.totalCount ?? 0}
            sortState={sortState}
            onDateSortChange={handleDateSortChange}
            onPowerSortChange={handlePowerSortChange}
          />
        </div>
      ) : null}
    </div>
  );
}
