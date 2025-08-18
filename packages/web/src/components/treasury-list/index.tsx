"use client";
import BigNumber from "bignumber.js";
import { isNil } from "lodash-es";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useGetTokenInfo } from "@/hooks/useGetTokenInfo";
import type { TokenWithBalance } from "@/hooks/useTokenBalances";
import { formatNumberForDisplay } from "@/utils/number";

import { Asset } from "../treasury-table/asset";
import { Skeleton } from "../ui/skeleton";

interface TreasuryListProps {
  data: TokenWithBalance[];
  caption?: string;
  isNativeToken?: boolean;
  standard?: "ERC20" | "ERC721";
  prices?: Record<string, number>;
  isLoading?: boolean;
}

const Caption = ({
  caption,
  handleViewMore,
}: {
  caption?: string;
  handleViewMore: () => void;
}) => {
  return (
    <div className="flex justify-center items-center w-full border border-border/20 bg-card rounded-[14px] px-4 py-2">
      <button
        onClick={handleViewMore}
        className="text-foreground transition-colors hover:text-foreground/80"
      >
        {caption || "View more"}
      </button>
    </div>
  );
};

export function TreasuryList({
  data,
  caption,
  isNativeToken,
  standard,
  prices,
  isLoading,
}: TreasuryListProps) {
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

  const getSectionTitle = () => {
    if (isNativeToken) return "Native Asset";
    return standard === "ERC20" ? "ERC-20 Assets" : "ERC-721 Assets";
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <h4 className="text-[12px] font-semibold text-foreground">
          {getSectionTitle()}
        </h4>
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[14px] bg-card p-4 border border-border/20"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="flex flex-col items-end gap-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="space-y-2">
        <h4 className="text-[12px] font-semibold text-foreground">
          {getSectionTitle()}
        </h4>
        <div className="rounded-[14px] bg-card p-[10px] text-center text-foreground/60">
          No assets found
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-[12px] font-semibold text-foreground">
        {getSectionTitle()}
      </h4>

      {displayData?.map((value, index) => {
        const symbol =
          tokenInfoWithNativeToken[value.contract as `0x${string}`]?.symbol;
        const assetValue = calculateAssetValue(value);
        const hasValue =
          standard === "ERC20" &&
          value?.priceId &&
          !isNil(prices?.[value.priceId.toLowerCase()]);

        return (
          <div
            key={symbol ?? index}
            className="rounded-[14px] bg-card p-[10px]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Asset
                  asset={value}
                  isNativeToken={isNativeToken}
                  symbol={
                    tokenInfoWithNativeToken[value.contract as `0x${string}`]
                      ?.symbol
                  }
                  explorer={daoConfig?.chain?.explorers?.[0] as string}
                />
              </div>

              <div className="flex flex-col items-end flex-shrink-0">
                <div className="text-sm text-muted-foreground">
                  Value{" "}
                  <span className="text-foreground font-medium">
                    {hasValue
                      ? `${formatNumberForDisplay(assetValue)?.[0]} USD`
                      : "N/A"}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  Balance{" "}
                  <span className="text-foreground font-medium">
                    {`${value?.formattedBalance} ${symbol ?? "N/A"}`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {data.length >= 5 && hasMoreItems && (
        <Caption caption={caption} handleViewMore={handleViewMore} />
      )}
    </div>
  );
}
