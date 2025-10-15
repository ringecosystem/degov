export type TreasuryAssetHistoricalPrice = {
  price: string;
  timestamp: string;
};

export type TreasuryAsset = {
  address: string;
  balance: string;
  balanceRaw: string;
  balanceUSD: string | null;
  chain: string;
  displayDecimals?: number | null;
  logo?: string | null;
  name: string;
  native?: boolean;
  price?: string | null;
  symbol: string;
  decimals?: number | null;
  historicalPrices?: TreasuryAssetHistoricalPrice[];
};

export type TreasuryAssetsResponse = {
  treasuryAssets: TreasuryAsset[];
};

export type TreasuryAssetsRequestVariables = {
  chain: string;
  address: string;
};
