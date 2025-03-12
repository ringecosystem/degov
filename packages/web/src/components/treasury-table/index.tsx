"use client";
import BigNumber from "bignumber.js";
import { isEmpty } from "lodash-es";
import { useCallback, useEffect, useMemo, useState } from "react";

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
import { useGetTokenInfo } from "@/hooks/useGetTokenInfo";
import type { TokenWithBalance } from "@/hooks/useTokenBalances";
import { formatNumberForDisplay } from "@/utils/number";

import { Skeleton } from "../ui/skeleton";

import { Asset } from "./asset";

function TableSkeleton({
  standard = "ERC20",
}: {
  standard?: "ERC20" | "ERC721";
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/4 rounded-l-[14px] text-left">
            {standard === "ERC20" ? "ERC-20 Assets" : "ERC-721 Assets"}
          </TableHead>
          <TableHead className="w-1/4 text-right">Balance</TableHead>
          <TableHead className="w-1/4 text-right">Value</TableHead>
          <TableHead className="w-1/4 text-right">Network</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, index) => (
          <TableRow key={index}>
            <TableCell className="text-left">
              <div className="flex items-center gap-[10px]">
                <Skeleton className="h-6 w-[100px]" />
              </div>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center gap-[10px] justify-end">
                <Skeleton className="h-6 w-[80px]" />
              </div>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center gap-[10px] justify-end">
                <Skeleton className="h-6 w-[100px]" />
              </div>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center gap-[10px] justify-end">
                <Skeleton className="h-6 w-[100px]" />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

interface TreasuryTableProps {
  data: TokenWithBalance[];
  caption?: string;
  standard?: "ERC20" | "ERC721";
  prices?: Record<string, number>;
  isLoading?: boolean;
}
export function TreasuryTable({
  data,
  caption,
  standard,
  prices,
  isLoading,
}: TreasuryTableProps) {
  const daoConfig = useDaoConfig();
  const [visibleItems, setVisibleItems] = useState(5);
  const { tokenInfo } = useGetTokenInfo(
    data.map((v) => ({
      contract: v?.contract,
      standard: v.standard,
    }))
  );

  const totalValue = useMemo(() => {
    if (!prices || isEmpty(prices) || isEmpty(data)) return 0;

    return data.reduce((total, asset) => {
      const priceValue = asset.priceId
        ? prices[asset.priceId.toLowerCase()]
        : 0;
      const price =
        priceValue === undefined || priceValue === null ? 0 : priceValue;

      const balance = asset.balance || "0";

      try {
        const value = new BigNumber(price).multipliedBy(balance).toNumber();
        return total + (isNaN(value) || !isFinite(value) ? 0 : value);
      } catch (error) {
        console.warn(`calculate asset value error: ${asset.priceId}`, error);
        return total;
      }
    }, 0);
  }, [prices, data]);

  const calculateAssetValue = useCallback(
    (asset: TokenWithBalance): number => {
      if (!prices || !asset.priceId) return 0;

      const price = prices[asset.priceId.toLowerCase()] || 0;
      const balance = asset.balance || "0";

      return new BigNumber(price).multipliedBy(balance).toNumber();
    },
    [prices]
  );

  const displayData = useMemo(() => {
    return data.slice(0, visibleItems);
  }, [data, visibleItems]);

  const handleViewMore = useCallback(() => {
    setVisibleItems((prev) => prev + 5);
  }, []);
  const hasMoreItems = data.length > visibleItems;

  useEffect(() => {
    return () => setVisibleItems(5);
  }, []);
  return (
    <div className="rounded-[14px] bg-card p-[20px]">
      {standard === "ERC20" && (
        <div className="flex items-center gap-[20px] mb-[20px]">
          <span className="text-[26px] font-semibold leading-normal text-muted-foreground">
            Total Value
          </span>
          {isLoading ? (
            <Skeleton className="h-[36px] w-[100px]" />
          ) : (
            <p className="text-[36px] font-semibold leading-normal">
              {formatNumberForDisplay(totalValue ?? 0)?.[0]} USD
            </p>
          )}
        </div>
      )}
      {isLoading ? (
        <TableSkeleton standard={standard} />
      ) : (
        <Table>
          {data.length >= 5 && hasMoreItems && (
            <TableCaption className="pb-0">
              <span
                className="text-foreground transition-colors hover:text-foreground/80 cursor-pointer"
                onClick={handleViewMore}
              >
                {caption || "View more"}
              </span>
            </TableCaption>
          )}
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/4 rounded-l-[14px] text-left">
                {standard === "ERC20" ? "ERC-20 Assets" : "ERC-721 Assets"}
              </TableHead>
              <TableHead className="w-1/4 text-right">Balance</TableHead>
              <TableHead className="w-1/4 text-right">Value</TableHead>
              <TableHead className="w-1/4 text-right rounded-r-[14px]">
                Network
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {displayData?.map((value, index) => (
              <TableRow
                key={
                  tokenInfo[value.contract as `0x${string}`]?.symbol ?? index
                }
              >
                <TableCell className="text-left">
                  <Asset
                    asset={value}
                    symbol={tokenInfo[value.contract as `0x${string}`]?.symbol}
                    explorer={daoConfig?.chain?.explorers?.[0] as string}
                  />
                </TableCell>
                <TableCell className="text-right">{`${
                  value?.formattedBalance
                } ${
                  tokenInfo[value.contract as `0x${string}`]?.symbol || "N/A"
                }`}</TableCell>
                <TableCell className="text-right">
                  {standard === "ERC20" &&
                  value?.priceId &&
                  prices?.[value.priceId.toLowerCase()]
                    ? `${
                        formatNumberForDisplay(calculateAssetValue(value))?.[0]
                      } USD`
                    : "N/A"}
                </TableCell>
                <TableCell className="text-right">
                  {daoConfig?.chain?.name || "N/A"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {!data?.length && (
        <Empty
          label="The types of assets for the DAO timelock are configured in the service configuration file during initial setup. If no assets are displayed here, you may need to update your configuration file and restart the service."
          className="h-[400px]"
        />
      )}
    </div>
  );
}
