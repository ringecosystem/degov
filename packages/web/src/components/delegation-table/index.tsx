import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { DEFAULT_PAGE_SIZE } from "@/config/base";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import {
  PAGINATION_DOTS,
  usePaginationRange,
} from "@/hooks/usePaginationRange";
import { useCurrentVotingPower } from "@/hooks/useSmartGetVotes";
import { delegateService } from "@/services/graphql";
import type { DelegateItem } from "@/services/graphql/types";
import { formatTimeAgo } from "@/utils/date";

import { AddressWithAvatar } from "../address-with-avatar";
import { CustomTable } from "../custom-table";
import { SortableCell } from "../sortable-cell";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../ui/pagination";

import type { ColumnType } from "../custom-table";
import type { Address } from "viem";

export type DelegationSortField = "date" | "power";
export type DelegationSortDirection = "asc" | "desc";
export interface DelegationSortState {
  field: DelegationSortField;
  direction: DelegationSortDirection;
}

interface DelegationTableProps {
  address: Address;
  orderBy: string;
  totalCount: number;
  sortState: DelegationSortState;
  onDateSortChange: (direction?: DelegationSortDirection) => void;
  onPowerSortChange: (direction?: DelegationSortDirection) => void;
}

export function DelegationTable({
  address,
  orderBy,
  totalCount,
  sortState,
  onDateSortChange,
  onPowerSortChange,
}: DelegationTableProps) {
  const formatTokenAmount = useFormatGovernanceTokenAmount();
  const daoConfig = useDaoConfig();
  const [currentPage, setCurrentPage] = useState(1);

  const { data: totalVotes } = useCurrentVotingPower(address);

  useEffect(() => {
    setCurrentPage(1);
  }, [orderBy, address]);

  const pageSize = DEFAULT_PAGE_SIZE;
  const totalPageCount = Math.max(1, Math.ceil((totalCount || 0) / pageSize));

  useEffect(() => {
    if (currentPage > totalPageCount) {
      setCurrentPage(totalPageCount);
    }
  }, [currentPage, totalPageCount]);

  const { data: pageData = [], isFetching } = useQuery<DelegateItem[]>({
    queryKey: [
      "delegation-table",
      daoConfig?.indexer?.endpoint,
      address,
      orderBy,
      currentPage,
      pageSize,
    ],
    queryFn: () =>
      delegateService.getAllDelegates(daoConfig?.indexer?.endpoint as string, {
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
        orderBy,
        where: { toDelegate_eq: address.toLowerCase() },
      }),
    enabled: !!daoConfig?.indexer?.endpoint && !!address,
    placeholderData: (previous) => previous ?? [],
  });

  const paginationRange = usePaginationRange(currentPage, totalPageCount);

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
        title: (
          <SortableCell
            label="Date"
            sortState={
              sortState.field === "date" ? sortState.direction : undefined
            }
            onClick={onDateSortChange}
            className="justify-start"
            textClassName="text-[14px]"
          />
        ),
        key: "date",
        width: "33%",
        className: "text-left",
        render: (record) => {
          const timeAgo = formatTimeAgo(record.blockTimestamp);

          return <span className="text-[14px]">{timeAgo || "-"}</span>;
        },
      },
      {
        title: (
          <SortableCell
            label="Votes"
            sortState={
              sortState.field === "power" ? sortState.direction : undefined
            }
            onClick={onPowerSortChange}
            className="justify-end"
            textClassName="text-[14px]"
          />
        ),
        key: "votes",
        width: "33%",
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
    [
      formatTokenAmount,
      totalVotes,
      sortState.field,
      sortState.direction,
      onDateSortChange,
      onPowerSortChange,
    ]
  );

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="rounded-[14px] bg-card p-[20px] shadow-card">
        <CustomTable
          dataSource={pageData}
          columns={columns}
          isLoading={isFetching}
          emptyText={<span>No delegations yet</span>}
          rowKey="id"
        />
      </div>

      {pageData.length > 0 && totalPageCount > 1 ? (
        <Pagination className="justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              />
            </PaginationItem>
            {paginationRange.map((item, index) => (
              <PaginationItem key={`${item}-${index}`}>
                {item === PAGINATION_DOTS ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    isActive={item === currentPage}
                    onClick={() => setCurrentPage(item as number)}
                  >
                    {item}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                onClick={() =>
                  setCurrentPage((prev) => Math.min(totalPageCount, prev + 1))
                }
                disabled={currentPage === totalPageCount}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
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
      <div>({percentage.toFixed(2)}%)</div>
    </div>
  );
}
