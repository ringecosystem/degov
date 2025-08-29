export interface SimpleBlock {
  number: string;
  timestamp: string;
}

export interface BlockIntervalOptions {
  chainId: number;
  // User-provided RPCs are now optional, as they can be merged with the built-in list.
  rpcs?: string[];
  enableFloatValue?: boolean;
}

const BLOCK_SAMPLE_SIZE = 10;


const ABI_FUNCTION_QUORUM = [
  {
    inputs: [{ internalType: "uint256", name: "timepoint", type: "uint256" }],
    name: "quorum",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

export class ChainTool {
  private blockIntervalCache = new Map<string, number>();

  // A built-in list of default RPCs for common chains.
  private readonly defaultRpcs = new Map<number, string[]>([
    [
      1,
      [
        "https://eth-mainnet.public.blastapi.io",
        "https://ethereum-rpc.publicnode.com",
        "https://mainnet.gateway.tenderly.co",
        "https://eth.blockrazor.xyz",
        "https://0xrpc.io/eth",
        "https://eth.llamarpc.com",
      ],
    ],
    [
      10,
      [
        "https://mainnet.optimism.io",
        "https://optimism-rpc.publicnode.com",
        "https://optimism.drpc.org",
        "https://rpc.ankr.com/optimism",
        "https://optimism.gateway.tenderly.co",
        "https://0xrpc.io/op",
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
        "https://bsc.rpc.blxrbdn.com",
        "https://bsc.blockrazor.xyz",
        "https://api.zan.top/bsc-mainnet",
        "https://bsc-dataseed1.bnbchain.org",
        "https://bsc-dataseed3.defibit.io",
      ],
    ],
    [
      100,
      [
        "https://rpc.gnosischain.com",
        "https://0xrpc.io/gno",
        "https://gnosis-mainnet.public.blastapi.io",
        "https://1rpc.io/gnosis",
        "https://gno-mainnet.gateway.tatum.io",
        "https://gnosis.oat.farm",
      ],
    ],
    [
      137,
      [
        "https://polygon-rpc.com",
        "https://polygon-public.nodies.app",
        "https://1rpc.io/matic",
        "https://polygon-bor-rpc.publicnode.com",
        "https://polygon-mainnet.gateway.tatum.io",
        "https://api.zan.top/polygon-mainnet",
      ],
    ],
    [2710, ["https://rpc.morphl2.io", "https://rpc-quicknode.morphl2.io"]],
    [
      5000,
      [
        "https://rpc.mantle.xyz",
        "https://1rpc.io/mantle",
        "https://mantle-mainnet.public.blastapi.io",
        "https://mantle-rpc.publicnode.com",
        "https://mantle.drpc.org",
        "https://mantle.api.onfinality.io/public",
      ],
    ],
    [
      8453,
      [
        "https://mainnet.base.org",
        "https://base-rpc.publicnode.com",
        "https://base.llamarpc.com",
        "https://base-mainnet.gateway.tatum.io",
        "https://base-public.nodies.app",
        "https://base.api.onfinality.io/public",
        "https://base.llamarpc.com",
        "https://base-mainnet.public.blastapi.io",
      ],
    ],
    [
      42161,
      [
        "https://arb1.arbitrum.io/rpc",
        "https://arbitrum-one-rpc.publicnode.com",
        "https://arbitrum-one.public.blastapi.io",
        "https://arbitrum.drpc.org",
        "https://arb1.lava.build",
        "https://rpc.poolz.finance/arbitrum",
        "https://arbitrum.rpc.subquery.network/public",
      ],
    ],
    [
      43114,
      [
        "https://api.avax.network/ext/bc/C/rpc",
        "https://avalanche-c-chain-rpc.publicnode.com",
        "https://0xrpc.io/avax",
        "https://avalanche.drpc.org",
        "https://avalanche.therpc.io",
        "https://api.zan.top/avax-mainnet/ext/bc/C/rpc",
      ],
    ],
    [
      59144,
      [
        "https://rpc.linea.build",
        "https://linea-rpc.publicnode.com",
        "https://linea.therpc.io",
        "https://1rpc.io/linea",
      ],
    ],
    [
      81457,
      [
        "https://rpc.blast.io",
        "https://blast-public.nodies.app",
        "https://rpc.ankr.com/blast",
        "https://blastl2-mainnet.public.blastapi.io",
      ],
    ],
    [
      534352,
      [
        "https://rpc.scroll.io",
        "https://1rpc.io/scroll",
        "https://scroll-mainnet.public.blastapi.io",
        "https://scroll.drpc.org",
      ],
    ],
  ]);

  async blockIntervalSeconds(options: BlockIntervalOptions): Promise<number> {
    const { chainId, rpcs = [], enableFloatValue = false } = options;
    const cacheKey = `${chainId}`;

    if (this.blockIntervalCache.has(cacheKey)) {
      console.log(`Using cached block interval for chain ${chainId}`);
      return this.blockIntervalCache.get(cacheKey)!;
    }

    // 1. Merge user-provided RPCs with the built-in list and remove duplicates.
    const builtInRpcs = this.defaultRpcs.get(chainId) || [];
    const allRpcs = [...new Set([...builtInRpcs, ...rpcs])];

    if (allRpcs.length === 0) {
      throw new Error(
        `No RPC endpoints found or provided for chainId: ${chainId}.`
      );
    }

    // 2. Concurrently send requests to all unique RPC endpoints.
    const promises = allRpcs.map((rpc) =>
      this._calculateIntervalForSingleRpc(rpc, enableFloatValue)
    );
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
   * An internal helper method to calculate the average block time for a single RPC endpoint.
   */
  private async _calculateIntervalForSingleRpc(
    endpoint: string,
    enableFloatValue: boolean
  ): Promise<number> {
    try {
      const latestBlockNumberHex = await this.getLatestBlockNumber(endpoint);
      const latestBlockNumber = BigInt(latestBlockNumberHex);
      const fromBlock = latestBlockNumber - BigInt(BLOCK_SAMPLE_SIZE - 1);

      const batchPayload = Array.from({ length: BLOCK_SAMPLE_SIZE }, (_, i) => {
        const blockNum = fromBlock + BigInt(i);
        return {
          jsonrpc: "2.0",
          method: "eth_getBlockByNumber",
          params: [`0x${blockNum.toString(16)}`, false],
          id: Number(blockNum),
        };
      });

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batchPayload),
      });

      if (!response.ok) {
        throw new Error(
          `HTTP error! status: ${response.status} ${response.statusText}`
        );
      }

      const responseData: any[] = await response.json();
      if (!responseData || !Array.isArray(responseData)) {
        throw new Error("Invalid response from RPC endpoint");
      }

      const blocks: SimpleBlock[] = responseData
        .map((res: any) => res.result)
        .filter(Boolean)
        .sort((a, b) => parseInt(a.number, 16) - parseInt(b.number, 16));

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
      if (!enableFloatValue) {
        return Math.floor(averageInterval);
      }
      return averageInterval;
    } catch (error) {
      throw error;
    }
  }

  private async getLatestBlockNumber(endpoint: string): Promise<string> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `HTTP error! status: ${response.status} ${response.statusText}`
      );
    }
    const data = await response.json();
    if (data.error) {
      throw new Error(`RPC Error: ${data.error.message}`);
    }
    return data.result;
  }
}
