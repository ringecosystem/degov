import NodeCache from "node-cache";

class NonceCache {
  private cache: NodeCache;

  constructor() {
    // Create cache instance with default TTL of 180 seconds (3 minutes)
    this.cache = new NodeCache({
      stdTTL: 180, // 3 minutes in seconds
      checkperiod: 60, // Clean expired entries every 60 seconds
      useClones: false, // Improve performance
    });
  }

  set(nonce: string): void {
    // Store nonce with default TTL (3 minutes)
    this.cache.set(nonce, true);
  }

  isValid(nonce: string): boolean {
    // Check if nonce exists and is not expired
    return this.cache.has(nonce);
  }

  remove(nonce: string): void {
    // Delete nonce
    this.cache.del(nonce);
  }

  // // Get cache statistics (optional, for debugging)
  // getStats() {
  //   return this.cache.getStats();
  // }
}

// Singleton pattern to ensure the entire app uses the same cache instance
export const nonceCache = new NonceCache();
