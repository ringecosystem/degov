import BigNumber from "bignumber.js";

import type { TreasuryAssetWithPortfolio } from "@/hooks/useTreasuryAssets";
import { formatCurrencyFixed, formatNumberForDisplay } from "@/utils";

import { Asset } from "../treasury-table/asset";

interface MobileAssetItemProps {
  asset: TreasuryAssetWithPortfolio;
  explorer?: string;
}

const formatTokenAmount = (balance?: string) => {
  if (!balance) return "0";

  const bn = new BigNumber(balance);
  if (!bn.isFinite()) return balance;

  try {
    return formatNumberForDisplay(bn.toNumber(), 2)[0];
  } catch {
    return bn.toFixed();
  }
};

export function MobileAssetItem({ asset, explorer }: MobileAssetItemProps) {
  const hasBalanceUSD =
    asset.balanceUSD !== null && asset.balanceUSD !== undefined;
  const valueDisplay = hasBalanceUSD
    ? formatCurrencyFixed(asset.balanceUSDValue)
    : "N/A";
  const balanceDisplay = `${formatTokenAmount(asset.balance)} ${
    asset.symbol || ""
  }`.trim();

  return (
    <div className="flex items-center justify-between gap-[10px] rounded-[14px] bg-card p-2.5  shadow-card">
      <div className="flex items-center gap-[5px]">
        <Asset asset={asset} explorer={explorer} />
      </div>
      <div className="inline-flex flex-col items-end gap-2.5">
        <div className="inline-flex items-center gap-[5px] text-[12px]">
          <span className="text-muted-foreground">Value</span>
          <span className="text-foreground">{valueDisplay}</span>
        </div>
        <div className="inline-flex items-center gap-[5px] text-[12px]">
          <span className="text-muted-foreground">Balance</span>
          <span className="text-foreground">{balanceDisplay}</span>
        </div>
      </div>
    </div>
  );
}
