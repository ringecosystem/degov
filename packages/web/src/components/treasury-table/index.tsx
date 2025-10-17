"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

import { TokenMinimalValueIcon } from "@/components/icons";
import { Empty } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import type { TreasuryAssetWithPortfolio } from "@/hooks/useTreasuryAssets";
import {
  formatBigIntForDisplay,
  formatCurrency,
  formatCurrencyFixed,
} from "@/utils/number";

import { Skeleton } from "../ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipPortal,
} from "../ui/tooltip";

import { Asset } from "./asset";

interface TreasuryTableProps {
  data: TreasuryAssetWithPortfolio[];
  caption?: string;
  isLoading?: boolean;
}

const formatPercent = (value: number, decimals: number = 2) =>
  `${value.toFixed(decimals)}%`;

const TokenHeaderLabel = () => (
  <span className="inline-flex items-center gap-[6px]">
    Token
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label="Token value display info"
          className="inline-flex h-[14px] w-[14px] cursor-default items-center justify-center text-muted-foreground"
          tabIndex={0}
        >
          <TokenMinimalValueIcon aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="top">
          Displaying tokens with minimal value of $0.01.
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  </span>
);

const TableSkeleton = () => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead className="w-[350px] rounded-l-[14px] text-left">
          <TokenHeaderLabel />
        </TableHead>
        <TableHead className="w-[215px] text-left">Portfolio %</TableHead>
        <TableHead className="w-[215px] text-left">Price (24h)</TableHead>
        <TableHead className="w-[180px] text-right rounded-r-[14px]">
          Balance
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {Array.from({ length: 5 }).map((_, index) => (
        <TableRow key={index}>
          <TableCell>
            <div className="flex items-center gap-[10px]">
              <Skeleton className="h-[30px] w-[30px] rounded-full" />
              <div className="flex flex-col gap-[6px]">
                <Skeleton className="h-[14px] w-[120px]" />
                <Skeleton className="h-[12px] w-[80px]" />
              </div>
            </div>
          </TableCell>
          <TableCell className="text-left">
            <Skeleton className="h-[14px] w-[60px]" />
          </TableCell>
          <TableCell className="text-left">
            <div className="flex flex-col items-start gap-[6px]">
              <Skeleton className="h-[14px] w-[80px]" />
              <Skeleton className="h-[12px] w-[90px]" />
            </div>
          </TableCell>
          <TableCell className="text-right">
            <div className="flex flex-col items-end gap-[6px]">
              <Skeleton className="h-[14px] w-[80px]" />
              <Skeleton className="h-[12px] w-[100px]" />
            </div>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

const getChangeClassName = (value: number) => {
  if (value > 0) return "text-success";
  if (value < 0) return "text-destructive";
  return "text-muted-foreground";
};

export function TreasuryTable({
  data,
  caption,
  isLoading,
}: TreasuryTableProps) {
  const daoConfig = useDaoConfig();
  const [visibleItems, setVisibleItems] = useState(5);

  const displayData = useMemo(
    () => data.slice(0, visibleItems),
    [data, visibleItems]
  );

  const handleViewMore = useCallback(() => {
    setVisibleItems((prev) => prev + 5);
  }, []);

  const hasMoreItems = data.length > visibleItems;

  useEffect(() => {
    return () => setVisibleItems(5);
  }, []);

  if (isLoading) {
    return (
      <div className="rounded-[14px] bg-card p-[20px] shadow-card">
        <TableSkeleton />
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="rounded-[14px] bg-card p-[20px] shadow-card">
        <Empty
          label="No assets found"
          style={{
            height: 24 * 6,
          }}
        />
      </div>
    );
  }

  return (
    <div className="rounded-[14px] bg-card p-[20px] shadow-card">
      <Table>
        {data.length >= 5 && hasMoreItems && (
          <TableCaption className="pb-0">
            <span
              className="cursor-pointer text-foreground transition-colors hover:text-foreground/80"
              onClick={handleViewMore}
            >
              {caption || "View more"}
            </span>
          </TableCaption>
        )}
        <TableHeader>
          <TableRow>
            <TableHead className="w-[350px] rounded-l-[14px] text-left">
              <TokenHeaderLabel />
            </TableHead>
            <TableHead className="w-[215px] text-left">Portfolio %</TableHead>
            <TableHead className="w-[215px] text-left">Price (24h)</TableHead>
            <TableHead className="w-[180px] text-right rounded-r-[14px]">
              Balance
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayData.map((asset) => {
            const explorer = daoConfig?.chain?.explorers?.[0];
            const priceAvailable =
              asset.price !== null && asset.price !== undefined;
            const hasPriceChange = Boolean(asset.priceChange24h);
            const changeValue = asset.priceChange24h?.absolute ?? 0;
            const changePercent = asset.priceChange24h?.percent ?? 0;
            const hasBalanceUSD =
              asset.balanceUSD !== null && asset.balanceUSD !== undefined;
            const portfolioPercent = asset.portfolioShare * 100;

            return (
              <TableRow key={`${asset.address}-${asset.symbol}`}>
                <TableCell className="text-left">
                  <Asset asset={asset} explorer={explorer} />
                </TableCell>
                <TableCell className="text-left">
                  {formatPercent(portfolioPercent)}
                </TableCell>
                <TableCell className="text-left">
                  <div className="flex flex-col items-start gap-[4px]">
                    <span className="text-[14px] font-medium text-foreground">
                      {priceAvailable
                        ? formatCurrency(asset.priceValue)
                        : "N/A"}
                    </span>
                    {hasPriceChange ? (
                      <span
                        className={`text-[12px] ${getChangeClassName(
                          changeValue
                        )}`}
                      >
                        {formatCurrency(changeValue)} (
                        {formatPercent(changePercent)})
                      </span>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">
                        N/A
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-col items-end gap-[4px]">
                    <span className="text-[14px] font-medium text-foreground">
                      {hasBalanceUSD
                        ? formatCurrencyFixed(asset.balanceUSDValue)
                        : "N/A"}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {`${
                        asset.balanceRaw
                          ? formatBigIntForDisplay(
                              BigInt(asset.balanceRaw),
                              asset?.decimals ?? 18
                            )
                          : "0"
                      } ${asset.symbol || ""}`.trim()}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
