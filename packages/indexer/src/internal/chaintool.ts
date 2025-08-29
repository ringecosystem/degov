export interface SimpleBlock {
  number: string;
  timestamp: string;
}

export interface BlockIntervalOptions {
  chainId: number;
  endpoint: string;
  enableFloatValue?: boolean;
}

const BLOCK_SAMPLE_SIZE = 10;

export class ChainTool {
  private blockIntervalCache = new Map<string, number>();

  async pickRpc(options: { rpcs?: string[] }): Promise<string> {
    if (!options || !options.rpcs || options.rpcs.length === 0) {
      throw new Error("No RPC endpoints provided");
    }
    return options.rpcs[0];
  }

  async blockIntervalSeconds(options: BlockIntervalOptions): Promise<number> {
    const cacheKey = `${options.chainId}`;
    const enableFloatValue = options.enableFloatValue ?? false;

    if (this.blockIntervalCache.has(cacheKey)) {
      console.log(`Using cached block interval for chain ${options.chainId}`);
      return this.blockIntervalCache.get(cacheKey)!;
    }

    try {
      const latestBlockNumberHex = await this.getLatestBlockNumber(
        options.endpoint
      );
      const latestBlockNumber = BigInt(latestBlockNumberHex);

      const fromBlock = latestBlockNumber - BigInt(BLOCK_SAMPLE_SIZE - 1);

      console.log(
        `Fetching blocks from ${fromBlock} to ${latestBlockNumber} for chain ${options.chainId}`
      );

      const batchPayload = [];
      for (let i = fromBlock; i <= latestBlockNumber; i++) {
        batchPayload.push({
          jsonrpc: "2.0",
          method: "eth_getBlockByNumber",
          params: [`0x${i.toString(16)}`, false],
          id: Number(i),
        });
      }

      const response = await fetch(options.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batchPayload),
      });

      if (!response.ok) {
        throw new Error(
          `HTTP error! status: ${response.status} ${response.statusText}`
        );
      }

      const responseData: any[] = await response.json();

      if (!responseData || !Array.isArray(responseData)) {
        throw new Error("Invalid response from RPC endpoint for batch request");
      }

      const blocks: SimpleBlock[] = responseData
        .map((res: any) => res.result)
        .filter(Boolean)
        .sort((a, b) => parseInt(a.number, 16) - parseInt(b.number, 16));

      if (blocks.length < 2) {
        throw new Error("Need at least 2 blocks to calculate interval");
      }

      let totalInterval = 0;
      let intervalCount = 0;

      for (let i = 1; i < blocks.length; i++) {
        const currentBlock = blocks[i];
        const previousBlock = blocks[i - 1];

        if (currentBlock.timestamp && previousBlock.timestamp) {
          const currentTimestamp = BigInt(currentBlock.timestamp);
          const previousTimestamp = BigInt(previousBlock.timestamp);

          const interval = Number(currentTimestamp - previousTimestamp);
          totalInterval += interval;
          intervalCount++;
        }
      }

      if (intervalCount === 0) {
        throw new Error("No valid block intervals found");
      }

      let averageInterval = totalInterval / intervalCount;
      if (!enableFloatValue) {
        averageInterval = Math.floor(averageInterval);
      }

      this.blockIntervalCache.set(cacheKey, averageInterval);

      console.log(
        `Calculated average block interval for chain ${options.chainId}: ${averageInterval}s`
      );

      return averageInterval;
    } catch (error) {
      console.error(
        `Failed to calculate block interval for chain ${options.chainId}:`,
        error
      );
      throw error;
    }
  }

  private async getLatestBlockNumber(endpoint: string): Promise<string> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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
