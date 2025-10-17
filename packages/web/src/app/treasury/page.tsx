"use client";

import { filter, isFinite, isNil, partition, sumBy } from "lodash-es";
import Link from "next/link";
import { useMemo } from "react";

import ClipboardIconButton from "@/components/clipboard-icon-button";
import {
  ExternalLinkIcon,
  QuestionIcon,
  WarningIcon,
} from "@/components/icons";
import { TreasuryList } from "@/components/treasury-list";
import { SafeList } from "@/components/treasury-list/safe-list";
import { TreasuryTable } from "@/components/treasury-table";
import { SafeTable } from "@/components/treasury-table/safe-table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useTreasuryAssets } from "@/hooks/useTreasuryAssets";
import { formatNumberForDisplay } from "@/utils";

export default function Treasury() {
  const daoConfig = useDaoConfig();
  const timeLockAddress =
    daoConfig?.contracts?.timeLock || daoConfig?.contracts?.governor;
  const formattedAddress = useMemo(() => {
    if (!timeLockAddress) return null;
    return `${timeLockAddress.slice(0, 6)}...${timeLockAddress.slice(-6)}`;
  }, [timeLockAddress]);

  const { assets, isLoading } = useTreasuryAssets();

  const { filteredAssets, hasValuedAssets, visibleTotalValueUSD } =
    useMemo(() => {
      const filteredAssets = filter(assets, (asset) => {
        if (isNil(asset.balanceUSD)) {
          return true;
        }

        if (!isFinite(asset.balanceUSDValue)) {
          return true;
        }

        return Math.abs(asset.balanceUSDValue) >= 0.01;
      });

      const [assetsWithBalance] = partition(
        filteredAssets,
        (asset) => !isNil(asset.balanceUSD)
      );

      const visibleTotalValueUSD = sumBy(assetsWithBalance, (asset) =>
        isFinite(asset.balanceUSDValue) ? asset.balanceUSDValue : 0
      );

      return {
        filteredAssets,
        hasValuedAssets: assetsWithBalance.length > 0,
        visibleTotalValueUSD,
      };
    }, [assets]);

  const totalValueDisplay = useMemo(() => {
    if (!hasValuedAssets) return null;
    return formatNumberForDisplay(visibleTotalValueUSD, 2)[0];
  }, [hasValuedAssets, visibleTotalValueUSD]);

  return (
    <div className="flex flex-col gap-[15px] lg:gap-[20px]">
      <header className="flex flex-col gap-[10px] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-[5px]">
          <h3 className="text-[18px] font-semibold text-foreground lg:text-[18px]">
            Treasury Assets
          </h3>
          {formattedAddress ? (
            <span className="text-[16px] font-normal text-muted-foreground lg:text-[16px]">
              {formattedAddress}
            </span>
          ) : null}
          {Boolean(timeLockAddress) && (
            <span className="flex items-center gap-[5px]">
              <ClipboardIconButton text={timeLockAddress} size={16} />
              <Link
                className="cursor-pointer hover:opacity-80"
                href={`${daoConfig?.chain?.explorers?.[0]}/address/${timeLockAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                title="View on Explorer"
              >
                <ExternalLinkIcon
                  width={16}
                  height={16}
                  className="text-foreground"
                />
              </Link>
            </span>
          )}
        </div>

        <div className="flex items-center gap-[10px]">
          <span className="hidden text-[16px] font-normal leading-normal text-muted-foreground lg:block lg:text-[18px]">
            Total Value
          </span>
          {isLoading ? (
            <Skeleton className="h-[28px] w-[120px] lg:h-[36px] lg:w-[140px]" />
          ) : totalValueDisplay ? (
            <div className="flex items-center gap-[10px] text-[18px] font-semibold leading-normal text-foreground lg:text-[26px]">
              {totalValueDisplay} USD
            </div>
          ) : (
            <div className="flex items-center gap-[10px] text-[18px] font-semibold leading-normal lg:text-[26px]">
              N/A
              <Tooltip>
                <TooltipTrigger>
                  <QuestionIcon width={20} height={20} />
                </TooltipTrigger>
                <TooltipContent className="rounded-[14px] p-[10px]" side="left">
                  <span className="flex items-center gap-[10px] text-[14px] font-normal leading-normal text-foreground">
                    <WarningIcon
                      width={20}
                      height={20}
                      className="text-current"
                    />
                    Token price data is not available at this time
                  </span>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </header>

      <div className="space-y-6 lg:hidden">
        <TreasuryList data={filteredAssets} isLoading={isLoading} />
        <SafeList />
      </div>

      <div className="hidden space-y-[20px] lg:block">
        <TreasuryTable data={filteredAssets} isLoading={isLoading} />

        <div className="flex flex-col gap-[20px]">
          <h3 className="text-[18px] font-extrabold text-foreground">Safes</h3>
          <SafeTable />
        </div>
      </div>
    </div>
  );
}
