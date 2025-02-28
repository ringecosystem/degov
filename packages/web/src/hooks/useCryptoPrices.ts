import { useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";

import { usePriceStore } from "@/store/price";

const COINGECKO_API_URL = "https://api.coingecko.com/api/v3/simple/price";

interface CoinGeckoResponse {
  [coinId: string]: {
    usd: number;
  };
}

/**
 * fetch crypto prices from coingecko
 * @returns prices
 */
export function useCryptoPrices() {
  const { priceIds, setPrices } = usePriceStore(
    useShallow((state) => ({
      priceIds: state.priceIds,
      setPrices: state.setPrices,
    }))
  );

  return useQuery({
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

      const prices: Record<string, number> = {};
      Object.entries(data).forEach(([coinId, priceData]) => {
        prices[coinId.toLowerCase()] = priceData.usd;
      });

      setPrices(prices);
      return prices;
    },
    enabled: Array.isArray(priceIds) && priceIds.length > 0,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: 3,
  });
}
