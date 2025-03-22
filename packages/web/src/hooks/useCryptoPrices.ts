import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

const COINGECKO_API_URL = "https://api.coingecko.com/api/v3/simple/price";

type CoinGeckoResponse = Record<string, { usd: number }>;

export function useCryptoPrices(coinIds: string[] = []) {
  console.log("coinIds", coinIds);

  const priceIds = useMemo(() => {
    return Array.from(new Set(coinIds.map((id) => id.toLowerCase())));
  }, [coinIds]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["prices", priceIds],
    queryFn: async () => {
      if (priceIds.length === 0) return {};

      const response = await fetch(
        COINGECKO_API_URL + "?ids=" + priceIds.join(",") + "&vs_currencies=usd",
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
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const prices = useMemo(() => {
    if (!data) return {};

    const formattedPrices: Record<string, number> = {};
    Object.entries(data).forEach(([coinId, priceData]) => {
      formattedPrices[coinId.toLowerCase()] = priceData.usd;
    });

    return formattedPrices;
  }, [data]);

  const getPrice = useMemo(() => {
    return (coinId: string): number => {
      const id = coinId.toLowerCase();
      return prices[id] || 0;
    };
  }, [prices]);

  return {
    prices,
    getPrice,
    isLoading,
    isError,
    error,
  };
}
