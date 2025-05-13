"use client";

import BigNumber from "bignumber.js";
import { isEmpty, isUndefined } from "lodash-es";
import Image from "next/image";
import { useMemo } from "react";
import { formatUnits } from "viem";
import { useBalance } from "wagmi";

import ClipboardIconButton from "@/components/clipboard-icon-button";
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

  const timeLockAddress = daoConfig?.contracts?.timeLock;

  const tokenInfo = useMemo(() => {
    const nativeAsset: TokenWithBalance = {
      ...daoConfig?.chain?.nativeToken,
      name: daoConfig?.chain?.nativeToken.symbol ?? "",
      chainId: daoConfig?.chain?.id,
      contract: "0x0000000000000000000000000000000000000000" as `0x${string}`,
      standard: "ERC20",
      logo: daoConfig?.chain?.logo ?? "",
    };
    const ids = new Set<string>();

    if (daoConfig?.chain?.nativeToken?.priceId) {
      ids.add(daoConfig?.chain?.nativeToken?.priceId.toLowerCase());
    }
    if (!daoConfig?.timeLockAssets || isEmpty(daoConfig?.timeLockAssets))
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

    Object.entries(daoConfig.timeLockAssets).forEach(([, asset]) => {
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
    if (isEmpty(nativeAssets) || isEmpty(erc20Assets)) {
      return undefined;
    }

    const allAssets = [...nativeAssets, ...erc20Assets];

    const hasMissingPrice = allAssets.some((asset) => {
      return asset.priceId && !prices[asset?.priceId?.toLowerCase()];
    });

    // if has missing price, return undefined
    if (hasMissingPrice) {
      return undefined;
    }

    // calculate total value
    const totalValue = allAssets.reduce((total, asset) => {
      // get price, if not exist, return 0
      const priceValue = asset.priceId
        ? prices[asset.priceId.toLowerCase()]
        : 0;
      const price =
        priceValue === undefined || priceValue === null ? 0 : priceValue;

      // get balance, default is "0"
      const balance = asset?.formattedBalance || "0";

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
    <div className="flex flex-col gap-[20px]">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-[10px]">
          <h3 className="text-[18px] font-extrabold">TimeLock Assets</h3>
          <ClipboardIconButton text={timeLockAddress} size={16} />
        </div>
        {
          <div className="flex items-center gap-[10px] ">
            <span className="text-[18px] font-normal leading-normal text-muted-foreground">
              Total Value
            </span>
            {isLoadingBalances || isLoadingPrices ? (
              <Skeleton className="h-[36px] w-[100px]" />
            ) : isUndefined(currencyBalance) ? (
              <div className="text-[26px] font-semibold leading-normal flex items-center gap-[10px]">
                N/A
                <Tooltip>
                  <TooltipTrigger>
                    <Image
                      src="/assets/image/question.svg"
                      alt="question"
                      width={20}
                      height={20}
                    />
                  </TooltipTrigger>
                  <TooltipContent
                    className="rounded-[14px] p-[10px]"
                    side="left"
                  >
                    <span className="gap-[10px] text-[14px] font-normal leading-normal text-foreground flex items-center">
                      <Image
                        src="/assets/image/warning.svg"
                        alt="warning"
                        width={20}
                        height={20}
                      />
                      Token price data is not available at this time
                    </span>
                  </TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <div className="text-[26px] font-semibold leading-normal flex items-center gap-[10px]">
                {currencyBalance} USD
              </div>
            )}
          </div>
        }
      </header>

      <TreasuryTable
        standard="ERC20"
        isNativeToken
        data={nativeAssets}
        prices={prices}
        isLoading={isLoadingNativeTokenBalances || isLoadingPrices}
      />

      <TreasuryTable
        standard="ERC20"
        data={erc20Assets}
        prices={prices}
        isLoading={isLoadingBalances || isLoadingPrices}
      />
      <TreasuryTable
        standard="ERC721"
        data={erc721Assets}
        isLoading={isLoading721Balances}
      />

      <div className="flex flex-col gap-[20px]">
        <h3 className="text-[18px] font-extrabold">Safe Assets</h3>
        <SafeTable />
      </div>
    </div>
  );
}
