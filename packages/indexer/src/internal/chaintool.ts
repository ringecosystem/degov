import { createPublicClient, http, PublicClient, Abi } from "viem";

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
}

export interface QuorumResult {
  clockMode: ClockMode;
  quorum: bigint;
  decimals: bigint;
}

export enum ClockMode {
  Timestamp = "timestamp",
  BlockNumber = "blocknumber",
}

// --- CONSTANTS AND ABIS ---

const BLOCK_SAMPLE_SIZE = 10;

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

  // A built-in list of default RPCs for common chains.
  private readonly defaultRpcs = new Map<number, string[]>([
    [
      1,
      [
        "https://eth-mainnet.public.blastapi.io",
        "https://ethereum-rpc.publicnode.com",
        // "https://mainnet.gateway.tenderly.co",
        "https://1rpc.io/eth",
        "https://eth.llamarpc.com",
        "https://eth.rpc.blxrbdn.com",
        "https://eth.blockrazor.xyz",
        "https://eth.drpc.org"
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
        "https://1rpc.io/gnosis",
      ],
    ],
    [
      137,
      [
        "https://polygon-rpc.com",
        "https://polygon-public.nodies.app",
        "https://1rpc.io/matic",
      ],
    ],
    [2710, ["https://rpc.morphl2.io", "https://rpc-quicknode.morphl2.io"]],
    [
      5000,
      [
        "https://rpc.mantle.xyz",
        "https://1rpc.io/mantle",
        "https://mantle-mainnet.public.blastapi.io",
      ],
    ],
    [
      8453,
      [
        // "https://mainnet.base.org",
        "https://base-rpc.publicnode.com",
        "https://base.llamarpc.com",
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
        "https://1rpc.io/scroll",
        "https://scroll-mainnet.public.blastapi.io",
      ],
    ],
  ]);

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
          transport: http(rpcUrl),
        });
        return await action(client);
      } catch (error) {
        lastError = error;
        console.warn(
          `[ChainTool] RPC request to ${rpcUrl} failed. Trying next...`,
          error
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
      const client = createPublicClient({ transport: http(rpc) });
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

  /**
   * Determines the clock mode of a contract, trying multiple RPCs.
   */
  async clockMode(options: BaseContractOptions): Promise<ClockMode> {
    try {
      const result = await this._executeWithFallbacks(options, (client) =>
        client.readContract({
          address: options.contractAddress,
          abi: ABI_FUNCTION_CLOCK_MODE,
          functionName: "CLOCK_MODE",
        })
      );

      if (typeof result !== "string") return ClockMode.BlockNumber;

      const mode = new URLSearchParams(result.replace(/&/g, ";"))
        .get("mode")
        ?.toLowerCase();

      if (mode === "timestamp") return ClockMode.Timestamp;
      if (mode === "blocknumber") return ClockMode.BlockNumber;

      console.warn(`Unknown clock mode: ${mode} in result: ${result}`);
      return ClockMode.BlockNumber; // Default for unknown values
    } catch (error: any) {
      const message = error.message;
      // If the function doesn't exist on the contract, default to BlockNumber.
      if (
        message &&
        (message.includes("contract function not found") ||
          message.includes("CLOCK_MODE"))
      ) {
        return ClockMode.BlockNumber;
      }
      throw error;
    }
  }

  /**
   * Retrieves the quorum for a contract, trying multiple RPCs for each call.
   */
  async quorum(options: QueryQuorumOptions): Promise<QuorumResult> {
    const clockMode = await this.clockMode(options);
    let timepoint: bigint;

    try {
      // 1. Try to get the specific `clock` value from the contract
      const clockResult = await this._executeWithFallbacks(options, (client) =>
        client.readContract({
          address: options.contractAddress,
          abi: ABI_FUNCTION_CLOCK,
          functionName: "clock",
        })
      );
      timepoint = BigInt(clockResult as string);
    } catch (e: any) {
      // 2. If `clock()` fails, fallback to the latest block
      console.warn(
        `failed to query clock, falling back to latest block: ${e.message}`
      );
      const latestBlock = await this._executeWithFallbacks(options, (client) =>
        client.getBlock()
      );
      timepoint =
        clockMode === ClockMode.Timestamp
          ? latestBlock.timestamp
          : latestBlock.number;
    }

    // 3. Adjust timepoint to be safely in the past
    switch (clockMode) {
      case ClockMode.Timestamp:
        timepoint -= 60n * 3n; // 3 minutes ago
        break;
      case ClockMode.BlockNumber:
        timepoint -= 15n; // 15 blocks ago
        break;
    }

    // 4. Get the quorum at that timepoint
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

    const quorum = BigInt(quorumResult as string);

    let decimals: bigint | undefined;
    // 5. Optionally, get the token decimals
    const contractStandard = (options.standard ?? "ERC20").toUpperCase();
    try {
      if (contractStandard === "ERC721") {
        decimals = 1n;
      } else if (contractStandard === "ERC20") {
        const decimalsResult = await this._executeWithFallbacks(
          options,
          (client) =>
            client.readContract({
              address: options.governorTokenAddress!,
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
    if (decimals == undefined) {
      throw new Error("missing decimals value");
    }

    return { clockMode, quorum, decimals };
  }
}
