import { setTimeout } from "timers/promises";
import { promises as fs } from "fs";
import * as path from "path";
import * as yaml from "yaml";
import {
  IndexerContract,
  IndexerProcessorConfig,
  IndexerProcessorState,
} from "./types";
import { DegovIndexerHelpers } from "./internal/helpers";

const ETH_ADDRESS_SCALAR_VALUE =
  /^(\s*[^:#\n][^:\n]*:\s*)(0x[0-9a-fA-F]{40})(\s*(?:#.*)?)$/gm;

function quoteAddressScalars(yamlText: string): string {
  return yamlText.replace(
    ETH_ADDRESS_SCALAR_VALUE,
    (_match, prefix: string, value: string, suffix: string) =>
      `${prefix}"${value}"${suffix ?? ""}`
  );
}

export class DegovDataSource {
  constructor() {}

  static async fromDegovConfigPath(
    degovConfigPath: string
  ): Promise<IndexerProcessorConfig> {
    const dcds = new DegovConfigDataSource(degovConfigPath);
    return await dcds.processorConfig();
  }
}

class DegovConfigDataSource {
  constructor(private readonly configPath: string) {}

  async processorConfig(): Promise<IndexerProcessorConfig> {
    const raw = await this.readDegovConfigRaw();
    const dds = this.packDataSource(raw);
    return dds;
  }

  private packDataSource(rawDegovConfig: string): IndexerProcessorConfig {
    const degovConfig = yaml.parse(quoteAddressScalars(rawDegovConfig));
    const { chain, code, indexer, contracts } = degovConfig;
    const startBlockOverride = this.readIntegerOverride(
      "DEGOV_INDEXER_START_BLOCK"
    );
    const endBlockOverride = this.readIntegerOverride(
      "DEGOV_INDEXER_END_BLOCK"
    );
    let rpcs = chain.rpcs ?? [];
    if (indexer.rpc) {
      rpcs = [indexer.rpc, ...rpcs];
    }
    if (!rpcs || rpcs.length === 0) {
      throw new Error("no rpc found in degov config");
    }

    const contractNames = Object.keys(contracts);
    const indexContracts: IndexerContract[] = contractNames
      .filter((item) => {
        return ["governor", "governorToken", "timeLock"].indexOf(item) != -1;
      })
      .map((item) => {
        const c = contracts[item];
        const addr = c.address ? c.address : c;
        return {
          name: item,
          address: addr,
          standard: c.standard,
        } as IndexerContract;
      });

    const ipc: IndexerProcessorConfig = {
      chainId: chain.id,
      rpcs: rpcs,
      finalityConfirmation: indexer.finalityConfirmation ?? 50,
      capacity: indexer.capacity ?? 30,
      maxBatchCallSize: indexer.maxBatchCallSize ?? 200,
      gateway: indexer.gateway,
      startBlock: startBlockOverride ?? indexer.startBlock,
      endBlock: endBlockOverride ?? indexer.endBlock,
      works: [
        {
          daoCode: code,
          contracts: indexContracts,
        },
      ],
      state: {
        running: true,
      } as IndexerProcessorState,
    };
    return ipc;
  }

  private readIntegerOverride(name: string): number | undefined {
    const rawValue = process.env[name];
    if (!rawValue) {
      return undefined;
    }

    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(
        `Environment override ${name} must be a non-negative integer, received: ${rawValue}`
      );
    }

    return parsed;
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
          this.configPath.startsWith("http://") ||
          this.configPath.startsWith("https://")
        ) {
          // read from http
          const response = await fetch(this.configPath);
          if (!response.ok) {
            throw new Error(
              `failed to load config, http error! status: ${response.status}`
            );
          }
          degovConfigRaw = await response.text();
          break;
        } else {
          // read from file system
          const filePath = path.isAbsolute(this.configPath)
            ? this.configPath
            : path.join(process.cwd(), this.configPath);
          await fs.access(filePath); // Check if file exists
          degovConfigRaw = await fs.readFile(filePath, "utf-8");
          break;
        }
      } catch (e) {
        console.error(
          DegovIndexerHelpers.formatLogLine("datasource.config read failed", {
            configPath: this.configPath,
            error: DegovIndexerHelpers.formatError(e),
          })
        );
      }

      await setTimeout(1000);
    }
    return degovConfigRaw;
  }
}
