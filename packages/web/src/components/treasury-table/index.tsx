"use client";
import BigNumber from "bignumber.js";
import { isNil } from "lodash-es";
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
          <TableHead className="w-1/3 rounded-l-[14px] text-left">
            {standard === "ERC20" ? "ERC-20 Assets" : "ERC-721 Assets"}
          </TableHead>
          <TableHead className="w-1/3 text-center">Balance</TableHead>
          <TableHead className="w-1/3 text-right rounded-r-[14px]">
            Value
          </TableHead>
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
            <TableCell className="text-center">
              <div className="flex items-center gap-[10px] justify-center">
                <Skeleton className="h-6 w-[80px]" />
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
  isNativeToken?: boolean;
  standard?: "ERC20" | "ERC721";
  prices?: Record<string, number>;
  isLoading?: boolean;
}
export function TreasuryTable({
  data,
  caption,
  isNativeToken,
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

  const tokenInfoWithNativeToken = useMemo<
    Record<
      `0x${string}`,
      {
        symbol: string;
        decimals: number;
      }
    >
  >(() => {
    return {
      "0x0000000000000000000000000000000000000000": {
        symbol: daoConfig?.chain?.nativeToken?.symbol || "",
        decimals: daoConfig?.chain?.nativeToken?.decimals || 18,
      },
      ...(tokenInfo || {}),
    };
  }, [tokenInfo, daoConfig?.chain?.nativeToken]);

  const calculateAssetValue = useCallback(
    (asset: TokenWithBalance): number => {
      if (!prices || !asset.priceId) return 0;

      const price = prices[asset?.priceId?.toLowerCase()] || 0;

      return new BigNumber(price)
        .multipliedBy(asset?.formattedRawBalance ?? "0")
        .toNumber();
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
    <div className="rounded-[14px] bg-card p-[20px] shadow-card">
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
              <TableHead className="w-1/3 rounded-l-[14px] text-left">
                {isNativeToken
                  ? "Native Assets"
                  : standard === "ERC20"
                  ? "ERC-20 Assets"
                  : "ERC-721 Assets"}
              </TableHead>
              <TableHead className="w-1/3 text-center">Balance</TableHead>
              <TableHead className="w-1/3 text-right rounded-r-[14px]">
                Value
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {displayData?.map((value, index) => (
              <TableRow
                key={
                  tokenInfoWithNativeToken[value.contract as `0x${string}`]
                    ?.symbol ?? index
                }
              >
                <TableCell className="text-left">
                  <Asset
                    asset={value}
                    isNativeToken={isNativeToken}
                    symbol={
                      tokenInfoWithNativeToken[value.contract as `0x${string}`]
                        ?.symbol
                    }
                    explorer={daoConfig?.chain?.explorers?.[0] as string}
                  />
                </TableCell>
                <TableCell className="text-center">
                  {`${value?.formattedBalance} ${
                    tokenInfoWithNativeToken[value.contract as `0x${string}`]
                      ?.symbol ?? "N/A"
                  }`}
                </TableCell>
                <TableCell className="text-right">
                  {standard === "ERC20" &&
                  value?.priceId &&
                  !isNil(prices?.[value.priceId.toLowerCase()])
                    ? `${
                        formatNumberForDisplay(calculateAssetValue(value))?.[0]
                      } USD`
                    : "N/A"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {!data?.length && (
        <Empty
          label="No assets found"
          style={{
            height: 24 * 6,
          }}
        />
      )}
    </div>
  );
}
