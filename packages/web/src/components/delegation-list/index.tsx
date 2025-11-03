import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { DEFAULT_PAGE_SIZE } from "@/config/base";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import {
  PAGINATION_DOTS,
  usePaginationRange,
} from "@/hooks/usePaginationRange";
import { delegateService } from "@/services/graphql";
import type { DelegateItem } from "@/services/graphql/types";

import { AddressAvatar } from "../address-avatar";
import { AddressResolver } from "../address-resolver";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../ui/pagination";
import { Skeleton } from "../ui/skeleton";

import type { Address } from "viem";

interface DelegationListProps {
  address: Address;
  orderBy: string;
  totalCount: number;
}

export function DelegationList({
  address,
  orderBy,
  totalCount,
}: DelegationListProps) {
  const formatTokenAmount = useFormatGovernanceTokenAmount();
  const daoConfig = useDaoConfig();
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [orderBy, address]);

  const pageSize = DEFAULT_PAGE_SIZE;
  const totalPageCount = useMemo(() => {
    return Math.max(1, Math.ceil((totalCount || 0) / pageSize));
  }, [totalCount, pageSize]);

  useEffect(() => {
    if (currentPage > totalPageCount) {
      setCurrentPage(totalPageCount);
    }
  }, [currentPage, totalPageCount]);

  const {
    data: pageData = [],
    isLoading,
    isFetching,
  } = useQuery<DelegateItem[]>({
    queryKey: [
      "delegation-list",
      daoConfig?.indexer?.endpoint,
      address,
      orderBy,
      currentPage,
      pageSize,
    ],
    queryFn: () =>
      delegateService.getAllDelegates(
        daoConfig?.indexer?.endpoint as string,
        {
          limit: pageSize,
          offset: (currentPage - 1) * pageSize,
          orderBy,
          where: { toDelegate_eq: address.toLowerCase() },
        }
      ),
    enabled: !!daoConfig?.indexer?.endpoint && !!address,
    placeholderData: (previous) => previous ?? [],
  });

  const paginationRange = usePaginationRange(currentPage, totalPageCount);

  if (isLoading && pageData.length === 0) {
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
              <div className="flex flex-col items-end shrink-0">
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!pageData || pageData.length === 0) {
    return (
      <div className="rounded-[14px] bg-card p-[20px] text-center text-muted-foreground">
        No delegations yet
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pageData.map((record: DelegateItem) => {
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

              <div className="flex flex-col items-end shrink-0">
                <div className="text-sm font-medium text-foreground">
                  {formattedAmount?.formatted}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {totalPageCount > 1 ? (
        <Pagination className="justify-center">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() =>
                  setCurrentPage((prev) => Math.max(1, prev - 1))
                }
                disabled={currentPage === 1 || isFetching}
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
                    disabled={isFetching && item === currentPage}
                  >
                    {item}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                onClick={() =>
                  setCurrentPage((prev) =>
                    Math.min(totalPageCount, prev + 1)
                  )
                }
                disabled={currentPage === totalPageCount || isFetching}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  );
}
