import { createPublicClient, http, webSocket, PublicClient, Abi } from "viem";
import { DegovIndexerHelpers } from "./helpers";

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

export interface ReadContractOptions extends BaseContractOptions {
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

export interface QueryQuorumOptions extends BaseContractOptions {
  standard?: "ERC20" | "ERC721";
  governorTokenAddress: `0x${string}`;
  governorTokenStandard?: "ERC20" | "ERC721";
  timepoint?: bigint;
}

export interface QuorumResult {
  clockMode: ClockMode;
  quorum: bigint;
  decimals: bigint;
}

export interface CurrentClockResult {
  clockMode: ClockMode;
  timepoint: bigint;
  timestampMs: bigint;
}

export interface HistoricalVotesResult {
  method: "getPastVotes" | "getPriorVotes";
  votes: bigint;
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

const ABI_FUNCTION_GET_PAST_VOTES: Abi = [
  {
    inputs: [
      { internalType: "address", name: "account", type: "address" },
      { internalType: "uint256", name: "timepoint", type: "uint256" },
    ],
    name: "getPastVotes",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

const ABI_FUNCTION_GET_PRIOR_VOTES: Abi = [
  {
    inputs: [
      { internalType: "address", name: "account", type: "address" },
      { internalType: "uint256", name: "blockNumber", type: "uint256" },
    ],
    name: "getPriorVotes",
    outputs: [{ internalType: "uint96", name: "", type: "uint96" }],
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

  private isMissingFunctionError(error: any): boolean {
    const message = `${error?.message ?? ""}`.toLowerCase();
    return (
      message.includes("contract function not found") ||
      message.includes("execution reverted") ||
      message.includes("function does not exist") ||
      message.includes("reverted with the following reason") ||
      message.includes("vm exception while processing transaction: revert")
    );
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
          DegovIndexerHelpers.formatLogLine("chaintool.rpc retry", {
            chainId,
            rpc: rpcUrl,
            error: DegovIndexerHelpers.formatError(error),
          })
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
      DegovIndexerHelpers.logVerbose("chaintool.block-interval cache hit", {
        chainId,
      });
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
          DegovIndexerHelpers.formatLogLine("chaintool.block-interval rpc failed", {
            chainId,
            rpc: allRpcs[index],
            error: DegovIndexerHelpers.formatError(result.reason),
          })
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
    DegovIndexerHelpers.logVerbose("chaintool.block-interval cached", {
      chainId,
      rpcCount: successfulIntervals.length,
      averageSeconds: averageInterval,
    });

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
      DegovIndexerHelpers.logVerbose("chaintool.clock-mode cache hit", {
        chainId: options.chainId,
        contract: options.contractAddress,
      });
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
            DegovIndexerHelpers.formatLogLine("chaintool.clock-mode fallback", {
              chainId: options.chainId,
              contract: options.contractAddress,
              reason: "unknown-clock-mode",
              mode,
              rawResult: result,
              fallback: ClockMode.BlockNumber,
            })
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
          DegovIndexerHelpers.formatLogLine("chaintool.clock-mode fallback", {
            chainId: options.chainId,
            contract: options.contractAddress,
            reason: "clock-mode-function-missing",
            fallback: ClockMode.BlockNumber,
          })
        );
        this.clockModeCache.set(cacheKey, ClockMode.BlockNumber);
        return ClockMode.BlockNumber;
      }
      throw error;
    }
  }

  async readContract<T = unknown>(options: ReadContractOptions): Promise<T> {
    const result = await this._executeWithFallbacks(options, (client) =>
      client.readContract({
        address: options.contractAddress,
        abi: options.abi,
        functionName: options.functionName as never,
        args: options.args as never,
      })
    );

    return result as T;
  }

  async readOptionalContract<T = unknown>(
    options: ReadContractOptions
  ): Promise<T | undefined> {
    try {
      return await this.readContract<T>(options);
    } catch (error) {
      if (this.isMissingFunctionError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async currentClock(options: BaseContractOptions): Promise<CurrentClockResult> {
    const clockMode = await this.clockMode(options);

    try {
      const timepoint = BigInt(
        await this.readContract<bigint>({
          ...options,
          abi: ABI_FUNCTION_CLOCK,
          functionName: "clock",
        })
      );

      if (clockMode === ClockMode.Timestamp) {
        return {
          clockMode,
          timepoint,
          timestampMs: timepoint * 1000n,
        };
      }

      const timestampMs =
        (await this.timepointToTimestampMs({
          ...options,
          timepoint,
          clockMode,
        })) ?? 0n;

      return {
        clockMode,
        timepoint,
        timestampMs,
      };
    } catch (error) {
      if (!this.isMissingFunctionError(error)) {
        throw error;
      }
    }

    const latestBlock = await this._executeWithFallbacks(options, (client) =>
      client.getBlock()
    );

    return {
      clockMode,
      timepoint:
        clockMode === ClockMode.Timestamp
          ? latestBlock.timestamp
          : (latestBlock.number ?? 0n),
      timestampMs: latestBlock.timestamp * 1000n,
    };
  }

  async historicalVotes(
    options: BaseContractOptions & {
      account: `0x${string}`;
      timepoint: bigint;
    }
  ): Promise<HistoricalVotesResult> {
    try {
      const votes = BigInt(
        await this.readContract<bigint>({
          ...options,
          abi: ABI_FUNCTION_GET_PAST_VOTES,
          functionName: "getPastVotes",
          args: [options.account, options.timepoint],
        })
      );

      return {
        method: "getPastVotes",
        votes,
      };
    } catch (error) {
      if (!this.isMissingFunctionError(error)) {
        throw error;
      }
    }

    const votes = BigInt(
      await this.readContract<bigint>({
        ...options,
        abi: ABI_FUNCTION_GET_PRIOR_VOTES,
        functionName: "getPriorVotes",
        args: [options.account, options.timepoint],
      })
    );

    return {
      method: "getPriorVotes",
      votes,
    };
  }

  async timepointToTimestampMs(options: {
    chainId: number;
    contractAddress: `0x${string}`;
    rpcs?: string[];
    timepoint: bigint;
    clockMode?: ClockMode;
  }): Promise<bigint | undefined> {
    const clockMode =
      options.clockMode ?? (await this.clockMode(options));
    if (clockMode === ClockMode.Timestamp) {
      return options.timepoint * 1000n;
    }

    try {
      const block = await this._executeWithFallbacks(options, (client) =>
        client.getBlock({ blockNumber: options.timepoint })
      );
      return block.timestamp * 1000n;
    } catch (error) {
      console.warn(
        DegovIndexerHelpers.formatLogLine(
          "chaintool.timepoint timestamp unresolved",
          {
            chainId: options.chainId,
            contract: options.contractAddress,
            timepoint: options.timepoint,
            error: DegovIndexerHelpers.formatError(error),
          },
        )
      );
      return undefined;
    }
  }

  async quorum(options: QueryQuorumOptions): Promise<QuorumResult> {
    const cacheKey = `${options.chainId}:${options.contractAddress}:${options.timepoint?.toString() ?? "latest"}`;
    const cachedEntry = this.quorumCache.get(cacheKey);

    // 1. Check if a valid, non-expired cache entry exists.
    if (
      cachedEntry &&
      Date.now() - cachedEntry.timestamp < QUORUM_CACHE_DURATION_MS
    ) {
      DegovIndexerHelpers.logVerbose("chaintool.quorum cache hit", {
        chainId: options.chainId,
        contract: options.contractAddress,
      });
      return cachedEntry.result;
    }

    // 2. If cache is stale or empty, try to fetch new data.
    try {
      if (cachedEntry) {
        DegovIndexerHelpers.logVerbose("chaintool.quorum cache stale", {
          chainId: options.chainId,
          contract: options.contractAddress,
        });
      }

      const clockMode = await this.clockMode(options);
      let timepoint: bigint;

      if (options.timepoint !== undefined) {
        timepoint = options.timepoint;
      } else {
        const currentClock = await this.currentClock(options);
        timepoint = currentClock.timepoint;

        switch (clockMode) {
          case ClockMode.Timestamp:
            timepoint = timepoint > 60n * 3n ? timepoint - 60n * 3n : 0n;
            break;
          case ClockMode.BlockNumber:
            timepoint = timepoint > 15n ? timepoint - 15n : 0n;
            break;
        }
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
      DegovIndexerHelpers.logVerbose("chaintool.quorum cached", {
        chainId: options.chainId,
        contract: options.contractAddress,
        quorum,
        decimals,
        clockMode,
      });

      return freshResult;
    } catch (error) {
      // 3. If fetching fails, use stale data if available.
      console.error(
        DegovIndexerHelpers.formatLogLine("chaintool.quorum fetch failed", {
          chainId: options.chainId,
          contract: options.contractAddress,
          error: DegovIndexerHelpers.formatError(error),
        })
      );

      if (cachedEntry) {
        console.warn(
          DegovIndexerHelpers.formatLogLine("chaintool.quorum cache used", {
            chainId: options.chainId,
            contract: options.contractAddress,
            reason: "fetch-failed",
          })
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
