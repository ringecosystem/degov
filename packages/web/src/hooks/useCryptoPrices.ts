import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { CACHE_TIMES } from "@/utils/query-config";

const COINGECKO_API_URL = "https://api.coingecko.com/api/v3/simple/price";

type CoinGeckoResponse = Record<
  string,
  {
    usd: number;
    usd_24h_change?: number;
    last_updated_at?: number;
  }
>;

type MarketData = {
  price: number;
  change24hPercent: number;
  lastUpdatedAt?: number;
};

type UseCryptoPricesOptions = {
  enabled?: boolean;
};

export function useCryptoPrices(
  coinIds: string[] = [],
  options: UseCryptoPricesOptions = {}
) {
  const priceIds = useMemo(() => {
    return Array.from(
      new Set(coinIds.map((id) => id.toLowerCase()).filter(Boolean))
    );
  }, [coinIds]);

  const isEnabled = options.enabled ?? true;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["prices", priceIds],
    queryFn: async () => {
      if (priceIds.length === 0) return {};

      const response = await fetch(
        `${COINGECKO_API_URL}?ids=${priceIds.join(
          ","
        )}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`,
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch prices: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as CoinGeckoResponse;
      return data;
    },
    enabled: isEnabled && priceIds.length > 0,
    refetchInterval: CACHE_TIMES.ONE_MINUTE,
  });

  const marketData = useMemo(() => {
    if (!data) return {};

    const formatted: Record<string, MarketData> = {};

    Object.entries(data).forEach(([coinId, priceData]) => {
      const lowerId = coinId.toLowerCase();
      formatted[lowerId] = {
        price: priceData.usd ?? 0,
        change24hPercent: priceData.usd_24h_change ?? 0,
        lastUpdatedAt: priceData.last_updated_at,
      };
    });

    return formatted;
  }, [data]);

  const prices = useMemo(() => {
    const result: Record<string, number> = {};
    Object.entries(marketData).forEach(([coinId, info]) => {
      result[coinId] = info.price;
    });
    return result;
  }, [marketData]);

  const priceChanges24h = useMemo(() => {
    const result: Record<string, number> = {};
    Object.entries(marketData).forEach(([coinId, info]) => {
      result[coinId] = info.change24hPercent;
    });
    return result;
  }, [marketData]);

  const getPrice = useMemo(() => {
    return (coinId: string): number => {
      const id = coinId.toLowerCase();
      return prices[id] || 0;
    };
  }, [prices]);

  const getChange24h = useMemo(() => {
    return (coinId: string): number => {
      const id = coinId.toLowerCase();
      return priceChanges24h[id] || 0;
    };
  }, [priceChanges24h]);

  return {
    prices,
    priceChanges24h,
    marketData,
    getPrice,
    getChange24h,
    isLoading,
    isError,
    error,
  };
}
