"use client";
import BigNumber from "bignumber.js";
import { isEmpty } from "lodash-es";
import { useMemo, useEffect, useState } from "react";
import { useBalance } from "wagmi";

import ClipboardIconButton from "@/components/clipboard-icon-button";
import { TreasuryTable } from "@/components/treasury-table";
import { Skeleton } from "@/components/ui/skeleton";
import { useCryptoPrices } from "@/hooks/useCryptoPrices";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import type { TokenWithBalance } from "@/hooks/useTokenBalances";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { usePriceStore } from "@/store/price";
import { formatBigIntForDisplay, formatNumberForDisplay } from "@/utils";

export default function Treasury() {
  const daoConfig = useDaoConfig();
  const timeLockAddress = daoConfig?.contracts?.timeLock;
  const [nativeTokenValue, setNativeTokenValue] = useState(0);
  const [erc20AssetsValue, setErc20AssetsValue] = useState(0);
  const tokenInfo = useMemo(() => {
    if (!daoConfig?.timeLockAssets || isEmpty(daoConfig?.timeLockAssets))
      return { erc20Assets: [], erc721Assets: [], priceIds: [] };

    const erc20: TokenWithBalance[] = [];
    const erc721: TokenWithBalance[] = [];
    const ids: string[] = [];

    Object.entries(daoConfig.timeLockAssets).forEach(([, asset]) => {
      const assetWithChainId = {
        ...asset,
        chainId: daoConfig.chain.id,
      };

      if (asset.standard === "ERC20") {
        erc20.push(assetWithChainId);
        if (asset.priceId) ids.push(asset.priceId.toLowerCase());
      } else if (asset.standard === "ERC721") {
        erc721.push(assetWithChainId);
      }
    });

    return { erc20Assets: erc20, erc721Assets: erc721, priceIds: ids };
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
  const nativeTokenData = useMemo(() => {
    return [
      {
        ...nativeTokenBalance,
        priceId: daoConfig?.chain?.nativeToken?.priceId,
        contract: "0x0000000000000000000000000000000000000000" as `0x${string}`,
        standard: "ERC20",
        logo: "",
        rawBalance: nativeTokenBalance?.value,
        balance: nativeTokenBalance?.value
          ? nativeTokenBalance.value.toString()
          : "0",
        formattedBalance: formatBigIntForDisplay(
          nativeTokenBalance?.value ?? 0n,
          daoConfig?.chain?.nativeToken?.decimals ?? 18
        ),
      },
    ];
  }, [nativeTokenBalance, daoConfig]);

  const { assets: erc20Assets, isLoading: isLoadingBalances } =
    useTokenBalances(tokenInfo.erc20Assets);

  const { assets: erc721Assets, isLoading: isLoading721Balances } =
    useTokenBalances(tokenInfo.erc721Assets);

  useEffect(() => {
    if (tokenInfo.priceIds.length > 0) {
      usePriceStore.getState().setPriceIds(tokenInfo.priceIds);
    }
  }, [tokenInfo.priceIds]);

  const { data: prices, isLoading: isLoadingPrices } = useCryptoPrices();

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
            ) : (
              <p className="text-[26px] font-semibold leading-normal">
                {
                  formatNumberForDisplay(
                    new BigNumber(nativeTokenValue)
                      .plus(erc20AssetsValue)
                      ?.toNumber()
                  )?.[0]
                }{" "}
                USD
              </p>
            )}
          </div>
        }
      </header>

      <TreasuryTable
        standard="ERC20"
        isNativeToken
        data={nativeTokenData}
        prices={prices}
        isLoading={isLoadingNativeTokenBalances || isLoadingPrices}
        onTotalValueChange={setNativeTokenValue}
      />

      <TreasuryTable
        standard="ERC20"
        data={erc20Assets}
        prices={prices}
        isLoading={isLoadingBalances || isLoadingPrices}
        onTotalValueChange={setErc20AssetsValue}
      />
      <TreasuryTable
        standard="ERC721"
        data={erc721Assets}
        isLoading={isLoading721Balances}
      />
    </div>
  );
}
