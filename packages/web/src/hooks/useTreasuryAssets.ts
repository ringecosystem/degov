import { useQuery } from "@tanstack/react-query";
import BigNumber from "bignumber.js";
import { env } from "next-runtime-env";
import { useMemo } from "react";
import { formatUnits } from "viem";
import { useBalance } from "wagmi";

import { treasuryService } from "@/services/graphql";
import type { TreasuryAsset } from "@/services/graphql/types/treasury";

import { useCryptoPrices } from "./useCryptoPrices";
import { useDaoConfig } from "./useDaoConfig";
import { useGetTokenInfo } from "./useGetTokenInfo";
import { useTokenBalances } from "./useTokenBalances";

type TreasuryAssetPriceChange = {
  absolute: number;
  percent: number;
};

export type TreasuryAssetWithPortfolio = TreasuryAsset & {
  portfolioShare: number;
  balanceValue: number;
  balanceUSDValue: number;
  priceValue: number;
  holdingsChangeUSD: number;
  priceChange24h?: TreasuryAssetPriceChange;
};

export type TreasuryAssetsData = {
  assets: TreasuryAssetWithPortfolio[];
  totalBalance: number;
  totalValueUSD: number;
  totalChangeUSD: number;
  totalChangePercent: number;
};

type UseTreasuryAssetsOptions = {
  address?: string;
  chainId?: number | string;
  enabled?: boolean;
};

type UseTreasuryAssetsResult = TreasuryAssetsData & {
  source: "config" | "api" | "none";
  isLoading: boolean;
  isError: boolean;
  error?: Error;
  refetch?: () => void;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DAY_IN_MS = 86_400_000;
const DEFAULT_PRICE_PRECISION = 18; // 与 GraphQL 服务对齐，保持价格字符串精度一致

const toOptionalNumber = (value?: number | string) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const toBigNumber = (value?: string | number | null) => {
  try {
    const bn = new BigNumber(value ?? 0);
    return bn.isNaN() ? new BigNumber(0) : bn;
  } catch {
    return new BigNumber(0);
  }
};

const buildHistoricalPrices = (
  price?: number,
  changePercent?: number,
  precision: number = DEFAULT_PRICE_PRECISION
): TreasuryAsset["historicalPrices"] => {
  if (price === undefined || price === null || Number.isNaN(price)) {
    return undefined;
  }

  const priceBn = new BigNumber(price);
  if (priceBn.isNaN()) {
    return undefined;
  }

  if (
    changePercent === undefined ||
    changePercent === null ||
    Number.isNaN(changePercent)
  ) {
    return [
      {
        price: priceBn.toFixed(precision),
        timestamp: `${Date.now()}`,
      },
    ];
  }

  const changeBn = new BigNumber(changePercent);
  const denominator = new BigNumber(1).plus(changeBn.dividedBy(100));
  const previousPrice = denominator.isZero()
    ? new BigNumber(0)
    : priceBn.dividedBy(denominator);

  return [
    {
      price: priceBn.toFixed(precision),
      timestamp: `${Date.now()}`,
    },
    {
      price: previousPrice.toFixed(precision),
      timestamp: `${Date.now() - DAY_IN_MS}`,
    },
  ];
};

const calculatePriceChange = (
  asset: TreasuryAsset
): TreasuryAssetPriceChange | undefined => {
  if (!asset.historicalPrices || asset.historicalPrices.length < 2) {
    return undefined;
  }

  const sorted = [...asset.historicalPrices].sort(
    (a, b) => Number(b.timestamp) - Number(a.timestamp)
  );

  const latest = toBigNumber(sorted[0]?.price);
  const previous = toBigNumber(sorted[1]?.price);

  if (latest.isNaN() || previous.isNaN()) {
    return undefined;
  }

  const absolute = latest.minus(previous);
  const percent = previous.isZero()
    ? new BigNumber(0)
    : absolute.dividedBy(previous).multipliedBy(100);

  return {
    absolute: absolute.toNumber(),
    percent: percent.toNumber(),
  };
};

const sumBalanceUSD = (asset: TreasuryAsset) => {
  const balanceUSD = toBigNumber(asset.balanceUSD);
  if (!balanceUSD.isZero()) {
    return balanceUSD;
  }

  const balance = toBigNumber(asset.balance);
  const price = toBigNumber(asset.price);
  if (balance.isZero() || price.isZero()) {
    return new BigNumber(0);
  }

  return balance.multipliedBy(price);
};

export const transformTreasuryAssets = (
  assets: TreasuryAsset[]
): TreasuryAssetsData => {
  const normalizedAssets = assets.map((asset) => ({
    ...asset,
    native:
      typeof asset.native === "number"
        ? asset.native !== 0
        : Boolean(asset.native),
  }));

  const totalBalance = normalizedAssets.reduce(
    (acc, asset) => acc.plus(toBigNumber(asset.balance)),
    new BigNumber(0)
  );

  const totalValueUSD = normalizedAssets.reduce(
    (acc, asset) => acc.plus(sumBalanceUSD(asset)),
    new BigNumber(0)
  );

  const denominator = totalValueUSD.isZero() ? totalBalance : totalValueUSD;

  const assetsWithPortfolio = normalizedAssets.map((asset) => {
    const balance = toBigNumber(asset.balance);
    const price = toBigNumber(asset.price);
    const balanceUSD = sumBalanceUSD(asset);
    const portfolioBase = totalValueUSD.isZero() ? balance : balanceUSD;
    const priceChange = calculatePriceChange(asset);

    const holdingsChangeUSD = priceChange
      ? toBigNumber(priceChange.absolute).multipliedBy(balance).toNumber()
      : 0;

    const portfolioShare = denominator.isZero()
      ? 0
      : portfolioBase.dividedBy(denominator).toNumber();

    return {
      ...asset,
      portfolioShare,
      balanceValue: balance.toNumber(),
      balanceUSDValue: balanceUSD.toNumber(),
      priceValue: price.toNumber(),
      priceChange24h: priceChange,
      holdingsChangeUSD,
    };
  });

  const totalChangeUSD = assetsWithPortfolio.reduce(
    (acc, asset) => acc + (asset.holdingsChangeUSD ?? 0),
    0
  );

  const previousTotalValue = totalValueUSD.minus(totalChangeUSD);
  const totalChangePercent = previousTotalValue.isZero()
    ? 0
    : (totalChangeUSD / previousTotalValue.toNumber()) * 100;

  return {
    assets: assetsWithPortfolio,
    totalBalance: totalBalance.toNumber(),
    totalValueUSD: totalValueUSD.toNumber(),
    totalChangeUSD,
    totalChangePercent,
  };
};

const useTreasuryAssetsFromApi = ({
  endpoint,
  chain,
  address,
  enabled,
}: {
  endpoint?: string;
  chain?: string;
  address?: string;
  enabled: boolean;
}) => {
  const query = useQuery<TreasuryAsset[], Error, TreasuryAssetsData>({
    queryKey: ["treasuryAssets", endpoint, chain, address],
    queryFn: async () => {
      if (!endpoint || !chain || !address) return [];
      return treasuryService.getTreasuryAssets(endpoint, {
        chain,
        address,
      });
    },
    enabled: Boolean(enabled && endpoint && chain && address),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    select: transformTreasuryAssets,
  });

  return query;
};

const useTreasuryAssetsFromConfig = ({
  enabled,
  address,
  chainId,
}: {
  enabled: boolean;
  address?: string;
  chainId?: number | string;
}): {
  data: TreasuryAssetsData;
  isLoading: boolean;
  isError: boolean;
  error?: Error;
} => {
  const daoConfig = useDaoConfig();

  const timeLockAddress =
    address ?? daoConfig?.contracts?.timeLock ?? daoConfig?.contracts?.governor;

  const targetChainId = chainId ?? daoConfig?.chain?.id;
  const resolvedChainId = toOptionalNumber(targetChainId);
  const chain =
    targetChainId !== undefined ? String(targetChainId) : undefined;

  const erc20Assets = useMemo(() => {
    if (!daoConfig?.treasuryAssets) return [];
    return daoConfig.treasuryAssets.filter(
      (asset) => asset.standard === "ERC20"
    );
  }, [daoConfig?.treasuryAssets]);

  const { tokenInfo } = useGetTokenInfo(
    erc20Assets.map((asset) => ({
      contract: asset.contract,
      standard: asset.standard,
    })),
    {
      chainId: resolvedChainId,
      enabled: Boolean(enabled && resolvedChainId !== undefined),
    }
  );

  const {
    assets: erc20WithBalances,
    isLoading: isLoadingErc20,
    isError: isErc20Error,
  } = useTokenBalances(erc20Assets, {
    address: timeLockAddress,
    chainId: resolvedChainId,
    enabled: Boolean(enabled && resolvedChainId !== undefined),
  });

  const {
    data: nativeBalance,
    isLoading: isLoadingNative,
    error: nativeError,
  } = useBalance({
    address: timeLockAddress as `0x${string}` | undefined,
    chainId: resolvedChainId,
    query: {
      enabled: Boolean(
        enabled &&
          timeLockAddress &&
          daoConfig?.chain?.nativeToken &&
          resolvedChainId !== undefined
      ),
    },
  });

  const priceIds = useMemo(() => {
    const ids = new Set<string>();

    if (daoConfig?.chain?.nativeToken?.priceId) {
      ids.add(daoConfig.chain.nativeToken.priceId.toLowerCase());
    }

    erc20Assets.forEach((asset) => {
      if (asset.priceId) {
        ids.add(asset.priceId.toLowerCase());
      }
    });

    return Array.from(ids);
  }, [daoConfig?.chain?.nativeToken?.priceId, erc20Assets]);

  const {
    marketData,
    isLoading: isLoadingPrices,
    error: priceFetchError,
  } = useCryptoPrices(priceIds, {
    enabled: Boolean(enabled && priceIds.length > 0),
  });

  const assets = useMemo(() => {
    if (!enabled || !chain) return [] as TreasuryAsset[];

    const result: TreasuryAsset[] = [];
    const nativeToken = daoConfig?.chain?.nativeToken;

    if (nativeToken && nativeBalance?.value !== undefined) {
      const decimals = nativeToken.decimals ?? 18;
      const balance = formatUnits(nativeBalance.value ?? 0n, decimals);
      const priceId = nativeToken.priceId?.toLowerCase();
      const priceInfo = priceId ? marketData[priceId] : undefined;

      const price = priceInfo?.price ?? null;
      const changePercent = priceInfo?.change24hPercent;
      const balanceUSD =
        price !== null
          ? new BigNumber(price).multipliedBy(balance).toString(10)
          : null;

      result.push({
        address: ZERO_ADDRESS,
        balance,
        balanceRaw: nativeBalance.value?.toString() ?? "0",
        balanceUSD,
        chain,
        displayDecimals: decimals,
        logo: nativeToken.logo ?? daoConfig?.chain?.logo ?? null,
        name: nativeToken.symbol ?? "",
        native: true,
        price: price !== null ? new BigNumber(price).toString(10) : null,
        symbol: nativeToken.symbol ?? "",
        decimals,
        historicalPrices: buildHistoricalPrices(
          price ?? undefined,
          changePercent,
          decimals
        ),
      });
    }

    erc20WithBalances.forEach((asset) => {
      const tokenMeta = tokenInfo[asset.contract as `0x${string}`];
      const decimals = tokenMeta?.decimals ?? 18;
      const symbol = tokenMeta?.symbol ?? asset.name;
      const balance = asset.formattedRawBalance ?? "0";
      const priceId = asset.priceId?.toLowerCase();
      const priceInfo = priceId ? marketData[priceId] : undefined;
      const price = priceInfo?.price ?? null;
      const changePercent = priceInfo?.change24hPercent;

      const balanceUSD =
        price !== null
          ? new BigNumber(price).multipliedBy(balance).toString(10)
          : null;

      result.push({
        address: asset.contract,
        balance,
        balanceRaw: asset.rawBalance?.toString() ?? "0",
        balanceUSD,
        chain,
        displayDecimals: decimals,
        logo: asset.logo ?? null,
        name: asset.name,
        native: false,
        price: price !== null ? new BigNumber(price).toString(10) : null,
        symbol,
        decimals,
        historicalPrices: buildHistoricalPrices(
          price ?? undefined,
          changePercent,
          decimals
        ),
      });
    });

    return result;
  }, [
    chain,
    daoConfig?.chain?.logo,
    daoConfig?.chain?.nativeToken,
    enabled,
    erc20WithBalances,
    marketData,
    nativeBalance?.value,
    tokenInfo,
  ]);

  const data = useMemo(() => transformTreasuryAssets(assets), [assets]);

  const loading =
    enabled && (isLoadingErc20 || isLoadingNative || isLoadingPrices);

  const error =
    nativeError ??
    (priceFetchError as Error | undefined) ??
    (isErc20Error ? new Error("Failed to fetch ERC-20 balances") : undefined);

  return {
    data,
    isLoading: loading,
    isError: Boolean(error),
    error,
  };
};

export const useTreasuryAssets = (
  options: UseTreasuryAssetsOptions = {}
): UseTreasuryAssetsResult => {
  const { address, chainId, enabled = true } = options;
  const daoConfig = useDaoConfig();

  const treasuryAddress =
    address ?? daoConfig?.contracts?.timeLock ?? daoConfig?.contracts?.governor;
  const targetChainId = chainId ?? daoConfig?.chain?.id;
  const chain = targetChainId !== undefined ? String(targetChainId) : undefined;
  const resolvedChainId = toOptionalNumber(targetChainId);

  const hasTreasuryAssetConfig = Boolean(daoConfig?.treasuryAssets?.length);
  const apiEndpoint = (() => {
    const base = env("NEXT_PUBLIC_DEGOV_API");
    return base ? `${base}/graphql` : undefined;
  })();

  const configResult = useTreasuryAssetsFromConfig({
    enabled: enabled && (hasTreasuryAssetConfig || !apiEndpoint),
    address: treasuryAddress,
    chainId: resolvedChainId,
  });

  const apiQuery = useTreasuryAssetsFromApi({
    endpoint: apiEndpoint,
    address: treasuryAddress,
    chain,
    enabled: enabled && !hasTreasuryAssetConfig && Boolean(apiEndpoint),
  });

  if (hasTreasuryAssetConfig || !apiEndpoint || !enabled) {
    return {
      ...configResult.data,
      source: "config",
      isLoading: configResult.isLoading,
      isError: configResult.isError,
      error: configResult.error,
    };
  }

  return {
    assets: apiQuery.data?.assets ?? [],
    totalBalance: apiQuery.data?.totalBalance ?? 0,
    totalValueUSD: apiQuery.data?.totalValueUSD ?? 0,
    totalChangeUSD: apiQuery.data?.totalChangeUSD ?? 0,
    totalChangePercent: apiQuery.data?.totalChangePercent ?? 0,
    source: apiQuery.data?.assets?.length ? "api" : "none",
    isLoading: apiQuery.isLoading,
    isError: apiQuery.isError,
    error: apiQuery.error ?? undefined,
    refetch: apiQuery.refetch,
  };
};
