"use client";

import BigNumber from "bignumber.js";
import { isEmpty, isUndefined } from "lodash-es";
import Link from "next/link";
import { useMemo } from "react";
import { formatUnits } from "viem";
import { useBalance } from "wagmi";

import ClipboardIconButton from "@/components/clipboard-icon-button";
import {
  ExternalLinkIcon,
  WarningIcon,
  QuestionIcon,
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
import { useCryptoPrices } from "@/hooks/useCryptoPrices";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import type { TokenWithBalance } from "@/hooks/useTokenBalances";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { formatBigIntForDisplay, formatNumberForDisplay } from "@/utils";

export default function Treasury() {
  const daoConfig = useDaoConfig();

  const timeLockAddress =
    daoConfig?.contracts?.timeLock || daoConfig?.contracts?.governor;

  const tokenInfo = useMemo(() => {
    const nativeAsset: TokenWithBalance = {
      ...daoConfig?.chain?.nativeToken,
      name: daoConfig?.chain?.nativeToken.symbol ?? "",
      chainId: daoConfig?.chain?.id,
      contract: "0x0000000000000000000000000000000000000000" as `0x${string}`,
      standard: "ERC20",
      logo: daoConfig?.chain?.nativeToken?.logo ?? daoConfig?.chain?.logo ?? "",
    };
    const ids = new Set<string>();

    if (daoConfig?.chain?.nativeToken?.priceId) {
      ids.add(daoConfig?.chain?.nativeToken?.priceId.toLowerCase());
    }
    if (!daoConfig?.treasuryAssets || isEmpty(daoConfig?.treasuryAssets))
      return {
        nativeAsset,
        erc20Assets: [],
        erc721Assets: [],
        priceIds: ids,
      };

    const erc20: TokenWithBalance[] = [];
    const erc721: TokenWithBalance[] = [];

    if (daoConfig?.chain?.nativeToken?.priceId) {
      ids.add(daoConfig?.chain?.nativeToken?.priceId.toLowerCase());
    }

    Object.entries(daoConfig.treasuryAssets).forEach(([, asset]) => {
      const assetWithChainId = {
        ...asset,
        chainId: daoConfig.chain.id,
      };

      if (asset.standard === "ERC20") {
        erc20.push(assetWithChainId);
        if (asset.priceId) ids.add(asset.priceId.toLowerCase());
      } else if (asset.standard === "ERC721") {
        erc721.push(assetWithChainId);
      }
    });

    return {
      nativeAsset,
      erc20Assets: erc20,
      erc721Assets: erc721,
      priceIds: ids,
    };
  }, [daoConfig]);

  // native token
  const { data: nativeTokenBalance, isLoading: isLoadingNativeTokenBalances } =
    useBalance({
      address: timeLockAddress as `0x${string}`,
      chainId: daoConfig?.chain?.id,
      query: {
        enabled: Boolean(timeLockAddress && daoConfig?.chain?.id),
      },
    });

  const nativeAssets = useMemo(() => {
    return [
      {
        ...tokenInfo.nativeAsset,
        rawBalance: nativeTokenBalance?.value,
        balance: nativeTokenBalance?.value?.toString(),
        formattedBalance: formatBigIntForDisplay(
          nativeTokenBalance?.value ?? 0n,
          daoConfig?.chain?.nativeToken?.decimals ?? 18
        ),
        formattedRawBalance: formatUnits(
          nativeTokenBalance?.value ?? 0n,
          daoConfig?.chain?.nativeToken?.decimals ?? 18
        ),
      },
    ];
  }, [nativeTokenBalance, tokenInfo.nativeAsset, daoConfig]);

  const { assets: erc20Assets, isLoading: isLoadingBalances } =
    useTokenBalances(tokenInfo.erc20Assets);

  const { assets: erc721Assets, isLoading: isLoading721Balances } =
    useTokenBalances(tokenInfo.erc721Assets);

  const { prices, isLoading: isLoadingPrices } = useCryptoPrices(
    Array.from(tokenInfo?.priceIds)
  );

  const currencyBalance = useMemo(() => {
    if (isEmpty(nativeAssets) && isEmpty(erc20Assets)) {
      return undefined;
    }

    const allAssets = [...nativeAssets, ...erc20Assets];

    // check if any asset has known price
    const hasAnyKnownPrice = allAssets.some((asset) => {
      return (
        asset.priceId &&
        prices[asset.priceId.toLowerCase()] &&
        prices[asset.priceId.toLowerCase()] > 0
      );
    });

    // if no asset has known price, return undefined to show N/A
    if (!hasAnyKnownPrice) {
      return undefined;
    }

    // calculate total value, only include assets with known prices
    const totalValue = allAssets.reduce((total, asset) => {
      // skip assets without priceId or unknown price
      if (!asset.priceId || !prices[asset.priceId.toLowerCase()]) {
        return total;
      }

      const priceValue = prices[asset.priceId.toLowerCase()];
      const price =
        priceValue === undefined || priceValue === null ? 0 : priceValue;

      // skip if price is 0
      if (price === 0) {
        return total;
      }

      // get balance, default is "0"
      const balance = asset?.formattedRawBalance || "0";
      try {
        // calculate current asset value and accumulate
        const value = new BigNumber(price).multipliedBy(balance).toNumber();
        return total + (isNaN(value) || !isFinite(value) ? 0 : value);
      } catch (error) {
        console.warn(`calculate asset value error: ${asset.priceId}`, error);
        return total;
      }
    }, 0);
    // return calculation result
    return totalValue ? formatNumberForDisplay(totalValue)?.[0] : "0";
  }, [nativeAssets, erc20Assets, prices]);

  return (
    <div className="flex flex-col gap-[15px] lg:gap-[20px]">
      <header className="flex sm:flex-row sm:items-center justify-between gap-[10px] sm:gap-0">
        <div className="flex items-center gap-[5px]">
          <h3 className="text-[16px] lg:text-[18px] font-extrabold text-foreground">
            Treasury Assets
          </h3>
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
          <span className="text-[16px] lg:text-[18px] font-normal leading-normal text-muted-foreground hidden lg:block">
            Total Value
          </span>
          {isLoadingBalances || isLoadingPrices ? (
            <Skeleton className="h-[28px] lg:h-[36px] w-[80px] lg:w-[100px]" />
          ) : isUndefined(currencyBalance) ? (
            <div className="text-[20px] lg:text-[26px] font-semibold leading-normal flex items-center gap-[10px]">
              N/A
              <Tooltip>
                <TooltipTrigger>
                  <QuestionIcon width={20} height={20} />
                </TooltipTrigger>
                <TooltipContent className="rounded-[14px] p-[10px]" side="left">
                  <span className="gap-[10px] text-[14px] font-normal leading-normal text-foreground flex items-center">
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
          ) : (
            <div className="text-[20px] lg:text-[26px] font-semibold leading-normal flex items-center gap-[10px]">
              {currencyBalance} USD
            </div>
          )}
        </div>
      </header>

      <div className="lg:hidden space-y-6">
        <TreasuryList
          standard="ERC20"
          isNativeToken
          data={nativeAssets}
          prices={prices}
          isLoading={isLoadingNativeTokenBalances || isLoadingPrices}
        />

        {erc20Assets?.length ? (
          <TreasuryList
            standard="ERC20"
            data={erc20Assets}
            prices={prices}
            isLoading={isLoadingBalances || isLoadingPrices}
          />
        ) : null}

        {erc721Assets?.length ? (
          <TreasuryList
            standard="ERC721"
            data={erc721Assets}
            isLoading={isLoading721Balances}
          />
        ) : null}

        <SafeList />
      </div>

      <div className="hidden lg:block space-y-[20px]">
        <TreasuryTable
          standard="ERC20"
          isNativeToken
          data={nativeAssets}
          prices={prices}
          isLoading={isLoadingNativeTokenBalances || isLoadingPrices}
        />

        {erc20Assets?.length ? (
          <TreasuryTable
            standard="ERC20"
            data={erc20Assets}
            prices={prices}
            isLoading={isLoadingBalances || isLoadingPrices}
          />
        ) : null}

        {erc721Assets?.length ? (
          <TreasuryTable
            standard="ERC721"
            data={erc721Assets}
            isLoading={isLoading721Balances}
          />
        ) : null}

        <div className="flex flex-col gap-[20px]">
          <h3 className="text-[18px] font-extrabold">Safe Assets</h3>
          <SafeTable />
        </div>
      </div>
    </div>
  );
}
