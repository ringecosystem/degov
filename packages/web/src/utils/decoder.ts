import { Interface, type InterfaceAbi } from "ethers";

import { proposalService } from "../services/graphql";

import "./cache-manager";

// ABI cache entry structure
interface AbiCacheEntry {
  abi: InterfaceAbi;
  name: string;
  timestamp: number;
  chainId: number;
  address: string;
}

// Cache configuration
const abiCache = new Map<string, AbiCacheEntry>();
const CACHE_PREFIX = "abi_cache_";

// Get ABI from cache (memory or localStorage)
const getCachedAbi = async (
  address: string,
  chainId: number
): Promise<AbiCacheEntry | null> => {
  const cacheKey = `${chainId}-${address.toLowerCase()}`;

  // Check memory cache first
  const memoryCache = abiCache.get(cacheKey);
  if (memoryCache) {
    return memoryCache;
  }

  // Check localStorage cache (client-side only)
  if (typeof window !== "undefined") {
    try {
      const localStorageKey = `${CACHE_PREFIX}${cacheKey}`;
      const cachedData = localStorage.getItem(localStorageKey);

      if (cachedData) {
        const cached = JSON.parse(cachedData) as AbiCacheEntry;
        // Update memory cache
        abiCache.set(cacheKey, cached);
        return cached;
      }
    } catch (error) {
      console.warn("Failed to read localStorage cache:", error);
    }
  }

  return null;
};

// Save ABI to cache (memory and localStorage)
const setCachedAbi = async (
  address: string,
  chainId: number,
  abi: InterfaceAbi,
  name: string
): Promise<void> => {
  const cacheKey = `${chainId}-${address.toLowerCase()}`;
  const cacheEntry: AbiCacheEntry = {
    abi,
    name,
    timestamp: Date.now(),
    chainId,
    address: address.toLowerCase(),
  };

  // Save to memory cache
  abiCache.set(cacheKey, cacheEntry);

  // Save to localStorage (client-side only)
  if (typeof window !== "undefined") {
    try {
      const localStorageKey = `${CACHE_PREFIX}${cacheKey}`;
      localStorage.setItem(localStorageKey, JSON.stringify(cacheEntry));
    } catch (error) {
      console.warn("Failed to write localStorage cache:", error);
      if (error instanceof Error && error.name === "QuotaExceededError") {
        console.warn(
          "localStorage quota exceeded. Consider clearing cache manually."
        );
      }
    }
  }
};

// Get cache statistics
export const getCacheStats = (): {
  memoryCount: number;
  localStorageCount: number;
  totalSize: string;
} => {
  let localStorageCount = 0;
  let totalSize = 0;

  if (typeof window !== "undefined") {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        localStorageCount++;
        const value = localStorage.getItem(key);
        if (value) {
          totalSize += new Blob([value]).size;
        }
      }
    }
  }

  return {
    memoryCount: abiCache.size,
    localStorageCount,
    totalSize: `${(totalSize / 1024).toFixed(2)} KB`,
  };
};

// Clear all cache (memory and localStorage)
export const clearAllCache = (): void => {
  // Clear memory cache
  abiCache.clear();

  // Clear localStorage cache
  if (typeof window !== "undefined") {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
    });
  }
};

// Fetch ABI from GraphQL service
async function fetchContractAbiFromGraphQL({
  address,
  chainId,
  endpoint,
}: {
  address: string;
  chainId: number;
  endpoint: string;
}): Promise<{ abis: { abi: InterfaceAbi; name: string; type: string }[] } | null> {
  if (!endpoint) {
    return null;
  }

  try {
    const results = await proposalService.getEvmAbi(endpoint, {
      chain: chainId,
      contract: address,
    });

    if (!results || results.length === 0) {
      throw new Error("No ABI found");
    }

    // Parse and return all ABIs
    const allAbis = results
      .filter(r => r.abi) // Only keep results with valid ABI
      .map(r => {
        const parsedAbi = typeof r.abi === "string" ? JSON.parse(r.abi) : r.abi;
        return {
          abi: parsedAbi,
          name: r.type === "PROXY" ? "Proxy Contract" : r.type === "IMPLEMENTATION" ? "Implementation Contract" : "Contract",
          type: r.type
        };
      });

    if (allAbis.length === 0) {
      throw new Error("No valid ABI found");
    }

    return { abis: allAbis };
  } catch (error) {
    console.warn("Failed to fetch ABI from GraphQL:", error);
    throw error;
  }
}

// In-memory cache for ABI requests to avoid duplicate requests for same address
const abiRequestCache = new Map<
  string,
  Promise<{ abis: { abi: InterfaceAbi; name: string; type: string }[] } | null>
>();

// Main function to fetch contract ABIs (returns all available ABIs)
export const fetchContractAbis = async ({
  address,
  chainId,
}: {
  address: string;
  chainId: number;
}): Promise<{
  abis: { abi: InterfaceAbi; name: string; type: string }[];
} | null> => {
  // Check in-memory request cache to avoid duplicate concurrent requests
  const cacheKey = `${address}-${chainId}`;
  let abiPromise = abiRequestCache.get(cacheKey);

  if (!abiPromise) {
    // Create new ABI fetch promise and cache it
    abiPromise = (async () => {
      try {
        // Try GraphQL ABI service (using environment configured endpoint)
        const abiEndpoint = process.env.NEXT_PUBLIC_DEGOV_API
          ? `${process.env.NEXT_PUBLIC_DEGOV_API}/graphql`
          : "https://api.degov.ai/graphql";
        if (abiEndpoint) {
          try {
            const result = await fetchContractAbiFromGraphQL({
              address,
              chainId,
              endpoint: abiEndpoint,
            });
            if (result && result.abis.length > 0) {
              // Cache the first successful ABI for backward compatibility
              const firstAbi = result.abis[0];
              await setCachedAbi(address, chainId, firstAbi.abi, firstAbi.name);
              return result;
            }
          } catch (error) {
            console.warn("GraphQL ABI query failed:", error);
          }
        }

        return null;
      } catch {
        return null;
      } finally {
        // Remove from cache after completion (success or failure)
        abiRequestCache.delete(cacheKey);
      }
    })();

    abiRequestCache.set(cacheKey, abiPromise);
  }

  return abiPromise;
};

// Backward compatibility function that returns the first ABI
export const fetchContractAbi = async ({
  address,
  chainId,
}: {
  address: string;
  chainId: number;
}): Promise<{
  abi: InterfaceAbi;
  name: string;
} | null> => {
  // Check persistent cache first
  const cached = await getCachedAbi(address, chainId);
  if (cached) {
    return { abi: cached.abi, name: cached.name };
  }

  const result = await fetchContractAbis({ address, chainId });
  if (result && result.abis.length > 0) {
    // Return the first ABI for backward compatibility
    const firstAbi = result.abis[0];
    return { abi: firstAbi.abi, name: firstAbi.name };
  }

  return null;
};

// Decode calldata using contract address and chain ID (try all ABIs)
export const decodeWithAddress = async ({
  address,
  chainId,
  calldata,
}: {
  address: string;
  chainId: number;
  calldata: string;
}): Promise<{
  abi: InterfaceAbi;
  name: string;
  decodedResult: ParsedTransaction | null;
} | null> => {
  try {
    const contractInfo = await fetchContractAbis({ address, chainId });
    if (!contractInfo || contractInfo.abis.length === 0) {
      throw new Error(
        `Failed to fetch ABI for contract ${address} on chain ${chainId}`
      );
    }

    // Try each ABI until one successfully parses the calldata
    for (const abiInfo of contractInfo.abis) {
      const { abi, name } = abiInfo;
      const iface = new Interface(abi);

      try {
        const parsed = iface.parseTransaction({ data: calldata });
        if (parsed) {
          const parsedTransaction: ParsedTransaction = {
            name: parsed.name,
            args: parsed.args.map((arg, index) => ({
              name: parsed.fragment.inputs[index]?.name || `param${index}`,
              type: parsed.fragment.inputs[index]?.type || "unknown",
              value: arg,
            })),
            signature: parsed.signature,
            selector: parsed.selector,
            fragment: parsed.fragment,
          };

          return {
            abi,
            name,
            decodedResult: parsedTransaction,
          };
        }
      } catch {
        // This ABI failed, try the next one
        continue;
      }
    }

    // None of the ABIs could parse the calldata
    const firstAbi = contractInfo.abis[0];
    return {
      abi: firstAbi.abi,
      name: firstAbi.name,
      decodedResult: null,
    };
  } catch {
    return null;
  }
};

// Decode calldata using provided ABI
export const decodeWithABI = ({
  abi,
  calldata,
}: {
  abi: InterfaceAbi;
  calldata: string;
}): ParsedTransaction | null => {
  try {
    const iface = new Interface(abi);
    const parsed = iface.parseTransaction({ data: calldata });

    if (parsed) {
      return {
        name: parsed.name,
        args: parsed.args.map((arg, index) => ({
          name: parsed.fragment.inputs[index]?.name || `param${index}`,
          type: parsed.fragment.inputs[index]?.type || "unknown",
          value: arg,
        })),
        signature: parsed.signature,
        selector: parsed.selector,
        fragment: parsed.fragment,
      };
    }

    return null;
  } catch {
    return null;
  }
};

// Decoded result interface
export interface DecodeRecursiveResult {
  functionName: string;
  args: Array<{
    name: string;
    type: string;
    value: unknown;
  }>;
  rawArgs: unknown[];
}

// Internal parsed transaction interface
interface ParsedTransaction {
  name: string;
  args: Array<{
    name: string;
    type: string;
    value: unknown;
  }>;
  signature: string;
  selector: string;
  fragment: unknown;
}

// Main recursive decode function
export const decodeRecursive = async ({
  calldata,
  abi,
  address,
  chainId,
}: {
  calldata: string;
  abi?: InterfaceAbi;
  address?: string;
  chainId?: number;
}): Promise<DecodeRecursiveResult | null> => {
  // Only process if we have ABI or (address + chainId)
  if (!abi && (!address || !chainId)) {
    return null;
  }

  try {
    let parsedTransaction: ParsedTransaction | null = null;

    // Use provided ABI if available
    if (abi) {
      parsedTransaction = decodeWithABI({ abi, calldata });
    }

    // Try to fetch ABI if no result and address provided
    if (!parsedTransaction && address && chainId) {
      const result = await decodeWithAddress({
        address,
        chainId,
        calldata,
      });
      if (result?.decodedResult) {
        parsedTransaction = result.decodedResult;
      }
    }

    if (!parsedTransaction) {
      return null;
    }

    // Recursively decode parameters
    const decodedArgs = await Promise.all(
      parsedTransaction.args.map(async (param) => ({
        name: param.name,
        type: param.type,
        value: await decodeParamTypes(param.value, param.type),
      }))
    );

    return {
      functionName: parsedTransaction.name,
      args: decodedArgs,
      rawArgs: parsedTransaction.args.map((arg) => arg.value),
    };
  } catch {
    return null;
  }
};

// Recursively decode parameter types
const decodeParamTypes = async (
  value: unknown,
  type: string
): Promise<unknown> => {
  if (type === "bytes" && typeof value === "string") {
    return await decodeBytesParam(value);
  } else if (type.startsWith("tuple") && Array.isArray(value)) {
    return await decodeTupleParam(value);
  } else if (type.includes("[]") && Array.isArray(value)) {
    return await decodeArrayParam(value, type);
  }

  return value;
};

// Decode bytes parameter
const decodeBytesParam = async (value: string): Promise<unknown> => {
  try {
    const decoded = await decodeRecursive({ calldata: value });
    return decoded || value;
  } catch {
    return value;
  }
};

// Decode tuple parameter
const decodeTupleParam = async (value: unknown[]): Promise<unknown[]> => {
  return Promise.all(
    value.map(async (item) => {
      if (typeof item === "string" && item.startsWith("0x")) {
        return await decodeBytesParam(item);
      }
      return item;
    })
  );
};

// Decode array parameter
const decodeArrayParam = async (
  value: unknown[],
  type: string
): Promise<unknown[]> => {
  const elementType = type.replace("[]", "");
  return Promise.all(
    value.map(async (item) => await decodeParamTypes(item, elementType))
  );
};
