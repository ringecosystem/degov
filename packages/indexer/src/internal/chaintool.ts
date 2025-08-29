export interface SimpleBlock {
  number: string;
  timestamp: string;
}

export interface BlockIntervalOptions {
  chainId: number;
  // Accepts an array of RPC endpoints
  rpcs: string[];
  enableFloatValue?: boolean;
}

const BLOCK_SAMPLE_SIZE = 10;

export class ChainTool {
  private blockIntervalCache = new Map<string, number>();

  /**
   * Queries multiple RPC endpoints and returns the average of their block times.
   */
  async blockIntervalSeconds(options: BlockIntervalOptions): Promise<number> {
    const { chainId, rpcs, enableFloatValue = false } = options;
    const cacheKey = `${chainId}`;

    if (!rpcs || rpcs.length === 0) {
      throw new Error("At least one RPC endpoint is required.");
    }

    if (this.blockIntervalCache.has(cacheKey)) {
      console.log(`Using cached block interval for chain ${chainId}`);
      return this.blockIntervalCache.get(cacheKey)!;
    }

    // 1. Concurrently send requests to all RPC endpoints
    const promises = rpcs.map((rpc) =>
      this._calculateIntervalForSingleRpc(rpc, enableFloatValue)
    );
    const results = await Promise.allSettled(promises);

    // 2. Collect all successful results and log the failed requests
    const successfulIntervals: number[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        successfulIntervals.push(result.value);
      } else {
        console.warn(
          `[ChainTool] RPC request to ${rpcs[index]} failed: ${result.reason.message}`
        );
      }
    });

    if (successfulIntervals.length === 0) {
      throw new Error(`All RPC requests failed for chain ${chainId}.`);
    }

    // 3. Calculate the average of the successful results
    const totalInterval = successfulIntervals.reduce(
      (sum, interval) => sum + interval,
      0
    );
    let averageInterval = totalInterval / successfulIntervals.length;

    if (!enableFloatValue) {
      averageInterval = Math.floor(averageInterval);
    }

    // 4. Cache and return the final average value
    this.blockIntervalCache.set(cacheKey, averageInterval);
    console.log(
      `Calculated final average block interval for chain ${chainId} from ${successfulIntervals.length} RPCs: ${averageInterval}s`
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
      // Propagate the error upwards to be handled by the main method
      throw error;
    }
  }

  /**
   * Gets the latest block number (unchanged).
   */
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
