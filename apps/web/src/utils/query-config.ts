import { hashFn } from "@wagmi/core/query";

export const CACHE_TIMES = {
  FIVE_SECONDS: 5 * 1000,
  TEN_SECONDS: 10 * 1000,
  THIRTY_SECONDS: 30 * 1000,
  ONE_MINUTE: 60 * 1000,
  FIVE_MINUTES: 5 * 60 * 1000,
  TEN_MINUTES: 10 * 60 * 1000,
  THIRTY_MINUTES: 30 * 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
} as const;

export const QUERY_CONFIGS = {
  STATIC: {
    staleTime: CACHE_TIMES.ONE_HOUR,
    gcTime: CACHE_TIMES.ONE_HOUR,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    retry: 1,
    retryDelay: 1000,
  },

  DEFAULT: {
    staleTime: CACHE_TIMES.FIVE_SECONDS,
    gcTime: CACHE_TIMES.FIVE_MINUTES,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 3,
    retryDelay: 1000,
  },

  FREQUENT: {
    staleTime: CACHE_TIMES.THIRTY_SECONDS,
    gcTime: CACHE_TIMES.FIVE_MINUTES,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: false,
    retry: 3,
    retryDelay: 1000,
  },
} as const;

export const createWagmiQueryConfig = () => ({
  defaultOptions: {
    queries: {
      queryKeyHashFn: hashFn,
      ...QUERY_CONFIGS.DEFAULT,
    },
  },
});
