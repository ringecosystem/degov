/**
 * Query configuration constants for consistent caching and refetching behavior
 */

// Cache time constants (in milliseconds)
export const CACHE_TIMES = {
  THIRTY_SECONDS: 30 * 1000,
  ONE_MINUTE: 60 * 1000,
  FIVE_MINUTES: 5 * 60 * 1000,
  THIRTY_MINUTES: 30 * 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  INFINITY: Infinity,
} as const;

// Common query configurations
export const QUERY_CONFIGS = {
  // Static data that rarely changes (clock mode, contract ABIs, etc.)
  STATIC: {
    staleTime: CACHE_TIMES.INFINITY,
    gcTime: CACHE_TIMES.INFINITY,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
    retryDelay: 1000,
  },

  // Default configuration for general use
  DEFAULT: {
    staleTime: CACHE_TIMES.ONE_HOUR,
    gcTime: CACHE_TIMES.ONE_HOUR,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
    retryDelay: 1000,
  },

  // Frequently changing data (block times, prices, etc.)
  FREQUENT: {
    staleTime: CACHE_TIMES.THIRTY_SECONDS,
    gcTime: CACHE_TIMES.FIVE_MINUTES,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 3,
    retryDelay: 1000,
  },
} as const;
