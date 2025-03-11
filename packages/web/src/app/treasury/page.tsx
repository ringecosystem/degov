"use client";
import { isEmpty } from "lodash-es";
import { useMemo, useEffect } from "react";

import ClipboardIconButton from "@/components/clipboard-icon-button";
import { TreasuryTable } from "@/components/treasury-table";
import { useCryptoPrices } from "@/hooks/useCryptoPrices";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import type { TokenWithBalance } from "@/hooks/useTokenBalances";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { usePriceStore } from "@/store/price";

export default function Treasury() {
  const daoConfig = useDaoConfig();
  const timeLockAddress = daoConfig?.contracts?.timeLock;

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
    <div className="flex flex-col gap-[20px] p-[30px]">
      <div className="flex items-center gap-[10px]">
        <h3 className="text-[18px] font-extrabold">TimeLock Assets</h3>
        <ClipboardIconButton text={timeLockAddress} size={16} />
      </div>

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
    </div>
  );
}
