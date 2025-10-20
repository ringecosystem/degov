"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useDaoConfig } from "@/hooks/useDaoConfig";
import type { TreasuryAssetWithPortfolio } from "@/hooks/useTreasuryAssets";

import { Skeleton } from "../ui/skeleton";

import { MobileAssetItem } from "./mobile-item";

interface TreasuryListProps {
  data: TreasuryAssetWithPortfolio[];
  caption?: string;
  isLoading?: boolean;
}

const Caption = ({
  caption,
  handleViewMore,
}: {
  caption?: string;
  handleViewMore: () => void;
}) => (
  <button
    onClick={handleViewMore}
    className="flex w-full items-center justify-center rounded-2xl bg-card p-2.5 text-sm font-medium text-foreground shadow-[6px_6px_54px_rgba(0,0,0,0.05)] transition-opacity hover:opacity-80"
  >
    {caption || "View more"}
  </button>
);

export function TreasuryList({ data, caption, isLoading }: TreasuryListProps) {
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
      <div className="space-y-2.5">
        <h4 className="hidden text-[12px] font-semibold text-foreground lg:block">
          Treasury Assets
        </h4>
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl bg-card p-4 shadow-[6px_6px_54px_rgba(0,0,0,0.05)]"
          >
            <div className="flex items-center justify-between gap-[16px]">
              <div className="flex min-w-0 items-center gap-[12px]">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex flex-col gap-[6px]">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <div className="flex flex-col items-end gap-[6px]">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="space-y-2.5">
        <h4 className="hidden text-[12px] font-semibold text-foreground lg:block">
          Treasury Assets
        </h4>
        <div className="rounded-2xl bg-card p-[10px] text-center text-foreground/60">
          No assets found
        </div>
      </div>
    );
  }

  const explorer = daoConfig?.chain?.explorers?.[0];

  return (
    <div className="space-y-2.5">
      <h4 className="hidden text-[12px] font-semibold text-foreground lg:block">
        Treasury Assets
      </h4>

      {displayData.map((asset) => (
        <MobileAssetItem
          key={`${asset.address}-${asset.symbol}`}
          asset={asset}
          explorer={explorer}
        />
      ))}

      {data.length >= 5 && hasMoreItems ? (
        <Caption caption={caption} handleViewMore={handleViewMore} />
      ) : null}
    </div>
  );
}
