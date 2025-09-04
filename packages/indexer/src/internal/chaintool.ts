import { createPublicClient, http, webSocket, PublicClient, Abi } from "viem";

// --- INTERFACES AND TYPES ---

export interface SimpleBlock {
  number: string;
  timestamp: string;
}

export interface BlockIntervalOptions {
  chainId: number;
  rpcs?: string[];
  enableFloatValue?: boolean;
}

export interface BaseContractOptions {
  chainId: number;
  contractAddress: `0x${string}`;
  rpcs?: string[];
}

export interface QueryQuorumOptions extends BaseContractOptions {
  standard?: "ERC20" | "ERC721";
  governorTokenAddress: `0x${string}`;
  governorTokenStandard?: "ERC20" | "ERC721";
}

export interface QuorumResult {
  clockMode: ClockMode;
  quorum: bigint;
  decimals: bigint;
}

// Added interface for the quorum cache entry
export interface QuorumCacheEntry {
  result: QuorumResult;
  timestamp: number; // The timestamp when the data was cached
}

export enum ClockMode {
  Timestamp = "timestamp",
  BlockNumber = "blocknumber",
}

// --- CONSTANTS AND ABIS ---

const BLOCK_SAMPLE_SIZE = 10;
const QUORUM_CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes in milliseconds

const ABI_FUNCTION_CLOCK_MODE: Abi = [
  {
    inputs: [],
    name: "CLOCK_MODE",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
];

const ABI_FUNCTION_CLOCK: Abi = [
  {
    inputs: [],
    name: "clock",
    outputs: [{ internalType: "uint48", name: "", type: "uint48" }],
    stateMutability: "view",
    type: "function",
  },
];

const ABI_FUNCTION_QUORUM: Abi = [
  {
    inputs: [{ internalType: "uint256", name: "timepoint", type: "uint256" }],
    name: "quorum",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

const ABI_FUNCTION_DECIMALS: Abi = [
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
];

// --- CHAINTOOL CLASS ---

export class ChainTool {
  private blockIntervalCache = new Map<string, number>();
  private clockModeCache = new Map<string, ClockMode>();
  private quorumCache = new Map<string, QuorumCacheEntry>();

  // A built-in list of default RPCs for common chains.
  private readonly defaultRpcs = new Map<number, string[]>([
    [
      1,
      [
        "https://eth-mainnet.public.blastapi.io",
        "https://ethereum-rpc.publicnode.com",
        // "https://mainnet.gateway.tenderly.co",
        // "https://1rpc.io/eth",
        "https://eth.llamarpc.com",
        "https://eth.rpc.blxrbdn.com",
        "https://eth.blockrazor.xyz",
        "https://eth.drpc.org",
      ],
    ],
    [
      10,
      [
        "https://mainnet.optimism.io",
        "https://optimism-rpc.publicnode.com",
        "https://optimism.drpc.org",
      ],
    ],
    [46, ["https://rpc.darwinia.network"]],
    [
      56,
      [
        "https://bsc-dataseed1.binance.org",
        "https://bsc-rpc.publicnode.com",
        "https://bsc.therpc.io",
      ],
    ],
    [
      100,
      [
        "https://rpc.gnosischain.com",
        "https://gnosis-mainnet.public.blastapi.io",
        // "https://1rpc.io/gnosis",
      ],
    ],
    [
      137,
      [
        "https://polygon-rpc.com",
        "https://polygon-public.nodies.app",
        // "https://1rpc.io/matic",
      ],
    ],
    [2710, ["https://rpc.morphl2.io", "https://rpc-quicknode.morphl2.io"]],
    [
      5000,
      [
        "https://rpc.mantle.xyz",
        // "https://1rpc.io/mantle",
        "https://mantle-mainnet.public.blastapi.io",
      ],
    ],
    [
      8453,
      [
        "https://base-rpc.publicnode.com",
        "https://base.llamarpc.com",
        "https://api.zan.top/base-mainnet",
        "https://base-mainnet.public.blastapi.io",
        "https://base.drpc.org",
        "https://base.lava.build",
        // "https://1rpc.io/base",
      ],
    ],
    [
      42161,
      [
        "https://arb1.arbitrum.io/rpc",
        "https://arbitrum-one-rpc.publicnode.com",
        "https://arbitrum-one.public.blastapi.io",
      ],
    ],
    [
      43114,
      [
        "https://api.avax.network/ext/bc/C/rpc",
        "https://avalanche-c-chain-rpc.publicnode.com",
        "https://0xrpc.io/avax",
      ],
    ],
    [
      59144,
      [
        "https://rpc.linea.build",
        "https://linea-rpc.publicnode.com",
        "https://linea.therpc.io",
      ],
    ],
    [
      81457,
      [
        "https://rpc.blast.io",
        "https://blast-public.nodies.app",
        "https://rpc.ankr.com/blast",
      ],
    ],
    [
      534352,
      [
        "https://rpc.scroll.io",
        // "https://1rpc.io/scroll",
        "https://scroll-mainnet.public.blastapi.io",
      ],
    ],
  ]);

  private stdHttpUrl(input: string): string {
    if (input.startsWith("ws://")) {
      return input.replace("ws://", "http://");
    }
    if (input.startsWith("wss://")) {
      return input.replace("wss://", "https://");
    }
    return input;
  }

  /**
   * Helper to execute a viem action with multiple RPC fallbacks for reliability.
   * It tries each RPC endpoint in sequence until one succeeds.
   */
  private async _executeWithFallbacks<T>(
    options: { chainId: number; rpcs?: string[] },
    action: (client: PublicClient) => Promise<T>
  ): Promise<T> {
    const { chainId, rpcs = [] } = options;
    const builtInRpcs = this.defaultRpcs.get(chainId) || [];
    const allRpcs = [...new Set([...rpcs, ...builtInRpcs])]; // User RPCs are prioritized

    if (allRpcs.length === 0) {
      throw new Error(
        `No RPC endpoints found or provided for chainId: ${chainId}.`
      );
    }

    let lastError: any;

    for (const rpcUrl of allRpcs) {
      try {
        const client = createPublicClient({
          transport: http(this.stdHttpUrl(rpcUrl)),
        });
        return await action(client);
      } catch (error) {
        lastError = error;
        console.warn(
          `[ChainTool] RPC request to ${rpcUrl} failed. Trying next...`
        );
      }
    }

    throw new Error(
      `All RPC requests failed for chain ${chainId}. Last error: ${lastError?.message}`
    );
  }

  /**
   * Calculates the average block interval using multiple RPCs for redundancy.
   */
  async blockIntervalSeconds(options: BlockIntervalOptions): Promise<number> {
    const { chainId, rpcs = [], enableFloatValue = false } = options;
    const cacheKey = `${chainId}`;

    if (this.blockIntervalCache.has(cacheKey)) {
      console.log(`Using cached block interval for chain ${chainId}`);
      return this.blockIntervalCache.get(cacheKey)!;
    }

    const builtInRpcs = this.defaultRpcs.get(chainId) || [];
    const allRpcs = [...new Set([...rpcs, ...builtInRpcs])];

    if (allRpcs.length === 0) {
      throw new Error(
        `No RPC endpoints found or provided for chainId: ${chainId}.`
      );
    }

    const promises = allRpcs.map((rpc) => {
      const client = createPublicClient({
        transport: http(this.stdHttpUrl(rpc)),
      });
      return this._calculateIntervalForSingleRpc(client, enableFloatValue);
    });

    const results = await Promise.allSettled(promises);

    const successfulIntervals: number[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        successfulIntervals.push(result.value);
      } else {
        console.warn(
          `[ChainTool] RPC request to ${allRpcs[index]} failed: ${result.reason.message}`
        );
      }
    });

    if (successfulIntervals.length === 0) {
      throw new Error(`All RPC requests failed for chain ${chainId}.`);
    }

    const totalInterval = successfulIntervals.reduce(
      (sum, interval) => sum + interval,
      0
    );
    let averageInterval = totalInterval / successfulIntervals.length;

    if (!enableFloatValue) {
      averageInterval = Math.floor(averageInterval);
    }

    this.blockIntervalCache.set(cacheKey, averageInterval);
    console.log(
      `Calculated final average block interval for chain ${chainId} from ${successfulIntervals.length} RPC(s): ${averageInterval}s`
    );

    return averageInterval;
  }

  /**
   * An internal helper using viem to calculate block time for a single client.
   */
  private async _calculateIntervalForSingleRpc(
    client: PublicClient,
    enableFloatValue: boolean
  ): Promise<number> {
    const latestBlockNumber = await client.getBlockNumber();
    const fromBlock = latestBlockNumber - BigInt(BLOCK_SAMPLE_SIZE - 1);

    const blockPromises: Promise<any>[] = [];
    for (let i = 0; i < BLOCK_SAMPLE_SIZE; i++) {
      const blockNum = fromBlock + BigInt(i);
      blockPromises.push(client.getBlock({ blockNumber: blockNum }));
    }

    const resolvedBlocks = await Promise.all(blockPromises);

    const blocks: SimpleBlock[] = resolvedBlocks
      .filter(Boolean)
      .map((b) => ({
        number: b.number!.toString(),
        timestamp: b.timestamp.toString(),
      }))
      .sort((a, b) => parseInt(a.number) - parseInt(b.number));

    if (blocks.length < 2) {
      throw new Error("Need at least 2 blocks to calculate interval");
    }

    let totalInterval = 0;
    for (let i = 1; i < blocks.length; i++) {
      const currentTimestamp = BigInt(blocks[i].timestamp);
      const previousTimestamp = BigInt(blocks[i - 1].timestamp);
      totalInterval += Number(currentTimestamp - previousTimestamp);
    }

    const intervalCount = blocks.length - 1;
    if (intervalCount === 0) {
      throw new Error("No valid block intervals found");
    }

    let averageInterval = totalInterval / intervalCount;
    return enableFloatValue ? averageInterval : Math.floor(averageInterval);
  }

  async clockMode(options: BaseContractOptions): Promise<ClockMode> {
    const cacheKey = `${options.chainId}:${options.contractAddress}`;
    if (this.clockModeCache.has(cacheKey)) {
      console.log(
        `Using cached clock mode for ${options.contractAddress} on chain ${options.chainId}`
      );
      return this.clockModeCache.get(cacheKey)!;
    }

    try {
      const result = await this._executeWithFallbacks(options, (client) =>
        client.readContract({
          address: options.contractAddress,
          abi: ABI_FUNCTION_CLOCK_MODE,
          functionName: "CLOCK_MODE",
        })
      );

      let modeToCache: ClockMode;
      if (typeof result === "string") {
        const mode = new URLSearchParams(result.replace(/&/g, ";"))
          .get("mode")
          ?.toLowerCase();

        modeToCache =
          mode === "timestamp" ? ClockMode.Timestamp : ClockMode.BlockNumber;
        if (mode !== "timestamp" && mode !== "blocknumber") {
          console.warn(
            `Unknown clock mode: ${mode} in result: ${result}. Defaulting to blocknumber.`
          );
        }
      } else {
        modeToCache = ClockMode.BlockNumber;
      }

      this.clockModeCache.set(cacheKey, modeToCache);
      return modeToCache;
    } catch (error: any) {
      const message = error.message;
      if (
        message &&
        (message.includes("contract function not found") ||
          message.includes("CLOCK_MODE"))
      ) {
        // If the function doesn't exist, it's a blocknumber-based contract. Cache this result.
        console.warn(
          `CLOCK_MODE function not found for ${options.contractAddress}. Caching as ${ClockMode.BlockNumber}.`
        );
        this.clockModeCache.set(cacheKey, ClockMode.BlockNumber);
        return ClockMode.BlockNumber;
      }
      throw error;
    }
  }

  async quorum(options: QueryQuorumOptions): Promise<QuorumResult> {
    const cacheKey = `${options.chainId}:${options.contractAddress}`;
    const cachedEntry = this.quorumCache.get(cacheKey);

    // 1. Check if a valid, non-expired cache entry exists.
    if (
      cachedEntry &&
      Date.now() - cachedEntry.timestamp < QUORUM_CACHE_DURATION_MS
    ) {
      console.log(
        `Using fresh cached quorum for ${options.contractAddress} on chain ${options.chainId}`
      );
      return cachedEntry.result;
    }

    // 2. If cache is stale or empty, try to fetch new data.
    try {
      if (cachedEntry) {
        console.log(
          `Cached quorum for ${options.contractAddress} is stale. Refetching...`
        );
      }

      const clockMode = await this.clockMode(options);
      let timepoint: bigint;

      try {
        const clockResult = await this._executeWithFallbacks(
          options,
          (client) =>
            client.readContract({
              address: options.contractAddress,
              abi: ABI_FUNCTION_CLOCK,
              functionName: "clock",
            })
        );
        timepoint = BigInt(clockResult as any);
      } catch (e: any) {
        console.warn(
          `Failed to query clock for ${options.contractAddress}, falling back to latest block: ${e.message}`
        );
        const latestBlock = await this._executeWithFallbacks(
          options,
          (client) => client.getBlock()
        );
        timepoint =
          clockMode === ClockMode.Timestamp
            ? latestBlock.timestamp
            : latestBlock.number!;
      }

      switch (clockMode) {
        case ClockMode.Timestamp:
          timepoint -= 60n * 3n; // 3 minutes ago
          break;
        case ClockMode.BlockNumber:
          timepoint -= 15n; // 15 blocks ago
          break;
      }

      const quorumResult = await this._executeWithFallbacks(options, (client) =>
        client.readContract({
          address: options.contractAddress,
          abi: ABI_FUNCTION_QUORUM,
          functionName: "quorum",
          args: [timepoint],
        })
      );
      if (quorumResult === undefined || quorumResult === null) {
        throw new Error("Failed to retrieve quorum from contract");
      }
      const quorum = BigInt(quorumResult as any);

      let decimals: bigint;
      const governorTokenContractStandard = (options.governorTokenStandard ?? "ERC20").toUpperCase();
      try {
        if (governorTokenContractStandard === "ERC721") {
          decimals = 0n;
        } else {
          const decimalsResult = await this._executeWithFallbacks(
            options,
            (client) =>
              client.readContract({
                address: options.governorTokenAddress,
                abi: ABI_FUNCTION_DECIMALS,
                functionName: "decimals",
              })
          );
          decimals = BigInt(decimalsResult as number);
        }
      } catch (e: any) {
        throw new Error(
          `Failed to query decimals for token ${options.governorTokenAddress}: ${e.message}`
        );
      }

      if (decimals === undefined) {
        throw new Error("Missing decimals value");
      }

      const freshResult: QuorumResult = { clockMode, quorum, decimals };

      // Cache the newly fetched result
      this.quorumCache.set(cacheKey, {
        result: freshResult,
        timestamp: Date.now(),
      });
      console.log(
        `Successfully fetched and cached new quorum for ${options.contractAddress} on chain ${options.chainId}`
      );

      return freshResult;
    } catch (error) {
      // 3. If fetching fails, use stale data if available.
      console.error(
        `[ChainTool] Failed to fetch new quorum for ${options.contractAddress}:`,
        error
      );

      if (cachedEntry) {
        console.warn(
          `[ChainTool] Serving stale quorum data for ${options.contractAddress} due to fetch failure.`
        );
        return cachedEntry.result;
      }

      // If there's no cached entry at all, we must throw the error.
      throw new Error(
        `All attempts to fetch quorum for ${options.contractAddress} failed, and no cached value was available.`
      );
    }
  }
}
