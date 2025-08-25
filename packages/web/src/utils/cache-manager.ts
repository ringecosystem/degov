// ABI cache management utilities
import { getCacheStats, clearAllCache } from './decoder';

export class AbiCacheManager {
  // Get cache statistics
  static getStats() {
    return getCacheStats();
  }

  // Clear all cache entries
  static clearAll() {
    clearAllCache();
  }

  // Get all cached contract addresses
  static getAllCachedContracts(): Array<{ address: string; chainId: number; name: string; cachedAt: string }> {
    if (typeof window === 'undefined') return [];

    const contracts: Array<{ address: string; chainId: number; name: string; cachedAt: string }> = [];
    const prefix = 'abi_cache_';

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        try {
          const cachedData = localStorage.getItem(key);
          if (cachedData) {
            const cached = JSON.parse(cachedData);
            contracts.push({
              address: cached.address,
              chainId: cached.chainId,
              name: cached.name,
              cachedAt: new Date(cached.timestamp).toLocaleString(),
            });
          }
        } catch (error) {
          console.warn(`Failed to parse cache entry: ${key}`, error);
        }
      }
    }

    return contracts.sort((a, b) => a.chainId - b.chainId || a.address.localeCompare(b.address));
  }

  // Clear cache for specific contract
  static clearContract(address: string, chainId: number): boolean {
    if (typeof window === 'undefined') return false;

    try {
      const cacheKey = `abi_cache_${chainId}-${address.toLowerCase()}`;
      localStorage.removeItem(cacheKey);

      return true;
    } catch (error) {
      console.warn('Failed to clear contract cache:', error);
      return false;
    }
  }

  // Export cache data for backup
  static exportCache(): string {
    if (typeof window === 'undefined') return '{}';

    const cacheData: Record<string, string> = {};
    const prefix = 'abi_cache_';

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const value = localStorage.getItem(key);
        if (value) {
          cacheData[key] = value;
        }
      }
    }

    return JSON.stringify(cacheData, null, 2);
  }

  // Import cache data for restoration
  static importCache(cacheDataJson: string): boolean {
    if (typeof window === 'undefined') return false;

    try {
      const cacheData = JSON.parse(cacheDataJson) as Record<string, unknown>;

      for (const [key, value] of Object.entries(cacheData)) {
        if (key.startsWith('abi_cache_') && typeof value === 'string') {
          localStorage.setItem(key, value);
        }
      }

      return true;
    } catch (error) {
      console.warn('Failed to import cache:', error);
      return false;
    }
  }
}

// Expose cache manager globally in development environment
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as unknown as Record<string, unknown>).AbiCacheManager = AbiCacheManager;
}
