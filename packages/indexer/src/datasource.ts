import { setTimeout } from "timers/promises";
import { promises as fs } from "fs";
import * as path from "path";
import * as yaml from "yaml";

export interface IndexerProcessorConfig {
  chainId: number;
  rpc: string;
  finalityConfirmation: number;

  capacity?: number;
  maxBatchCallSize?: number;
  gateway?: string;

  logs: IndexerWatchLog[];

  state: IndexerProcessorState;
}

export interface IndexerWatchLog {
  startBlock: number;
  endBlock?: number;
  contracts: IndexerContract[];
}

export interface IndexerContract {
  name: ContractName;
  address: string;
}

export interface IndexerProcessorState {
  running: boolean;
}

export type ContractName = "governor" | "governorToken";

export class DegovDataSource {
  constructor(private readonly _config: IndexerProcessorConfig) {}

  static async fromDegovConfig(
    degovConfig: string
  ): Promise<IndexerProcessorConfig> {
    const dcds = new DegovConfigDataSource(degovConfig);
    return await dcds.processorConfig();
  }
}

class DegovConfigDataSource {
  constructor(private readonly config: string) {}

  async processorConfig(): Promise<IndexerProcessorConfig> {
    const raw = await this.readDegovConfigRaw();
    const dds = this.packDataSource(raw);
    return dds;
  }

  private packDataSource(rawDegovConfig: string): IndexerProcessorConfig {
    const degovConfig = yaml.parse(rawDegovConfig);
    const { chain, indexer, contracts } = degovConfig;
    let rpcs = chain.rpcs ?? [];
    if (indexer.rpc) {
      rpcs = [indexer.rpc, ...rpcs];
    }
    if (!rpcs || rpcs.length === 0) {
      throw new Error("no rpc found in degov config");
    }

    const contractNames = Object.keys(contracts);
    const indexContracts: IndexerContract[] = contractNames.map((item) => {
      const c = contracts[item];
      const addr = c.address ? c.address : c;
      return {
        name: item,
        address: addr,
        standard: c.standard,
      } as IndexerContract;
    });
    const indexLog: IndexerWatchLog = {
      startBlock: indexer.startBlock,
      endBlock: indexer.endBlock,
      contracts: indexContracts,
    };

    const ipc: IndexerProcessorConfig = {
      chainId: chain.id,
      rpc: rpcs[0],
      finalityConfirmation: indexer.finalityConfirmation ?? 50,
      capacity: indexer.capacity ?? 30,
      maxBatchCallSize: indexer.maxBatchCallSize ?? 200,
      gateway: indexer.gateway,
      logs: [indexLog],
      state: {
        running: true,
      } as IndexerProcessorState,
    };
    return ipc;
  }

  private async readDegovConfigRaw(): Promise<string> {
    let degovConfigRaw;
    let times = 0;
    while (true) {
      times += 1;
      if (times > 3) {
        throw new Error("cannot read config file");
      }

      try {
        if (
          this.config.startsWith("http://") ||
          this.config.startsWith("https://")
        ) {
          // read from http
          const response = await fetch(this.config);
          if (!response.ok) {
            throw new Error(
              `failed to load config, http error! status: ${response.status}`
            );
          }
          degovConfigRaw = await response.text();
          break;
        } else {
          // read from file system
          const filePath = path.isAbsolute(this.config)
            ? this.config
            : path.join(process.cwd(), this.config);
          await fs.access(filePath); // Check if file exists
          degovConfigRaw = await fs.readFile(filePath, "utf-8");
          break;
        }
      } catch (e) {
        console.error(e);
      }

      await setTimeout(1000);
    }
    return degovConfigRaw;
  }
}
