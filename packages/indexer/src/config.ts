import { setTimeout } from "timers/promises";
import { promises as fs } from "fs";
import * as path from "path";
import * as yaml from "yaml";

export enum MetricsId {
  global = "global",
}

export interface DegovConfig {
  code: string;
  endpoint: DegovConfigEndpoint;
  indexLog: DegovConfigIndexLog;
  gateway?: string;
}

export interface DegovConfigEndpoint {
  id: number;
  rpcs: string[];
}

export interface DegovConfigIndexLog {
  startBlock: number;
  contracts: DegovConfigIndexLogContract[];
}

export interface DegovConfigIndexLogContract {
  name: string;
  address: string;
  standard?: string;
}

interface ChainNetwork {
  chainId: number;
  rpc: string[];
}

export class DegovConfigNanny {
  private async loadNetworks(): Promise<ChainNetwork[]> {
    try {
      const response = await fetch("https://chainid.network/chains_mini.json");
      if (!response.ok) {
        throw new Error(
          `failed to load chain network, http error! status: ${response.status}`
        );
      }
      const networks = await response.json();
      return networks;
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  private async pickRpcs(chainId: number): Promise<string[]> {
    const networks = await this.loadNetworks();
    const network = networks.find(
      (n) => n.chainId && chainId && n.chainId.toString() === chainId.toString()
    );
    if (!network) {
      return [];
    }
    const rpc = network.rpc;
    const rets = [];
    for (const item of rpc) {
      // todo: skip private rpc temporarily
      if (item.indexOf("${") != -1) {
        continue;
      }
      rets.push(item);
    }
    return rets;
  }

  private async readConfigRaw() {
    const degovConfigPath = process.env.DEGOV_CONFIG_PATH;
    if (!degovConfigPath) {
      throw new Error("DEGOV_CONFIG_PATH not set");
    }
    let degovConfigRaw;
    let times = 0;
    while (true) {
      times += 1;
      if (times > 3) {
        throw new Error("cannot read config file");
      }

      try {
        if (
          degovConfigPath.startsWith("http://") ||
          degovConfigPath.startsWith("https://")
        ) {
          // read from http
          const response = await fetch(degovConfigPath);
          if (!response.ok) {
            throw new Error(
              `failed to load config, http error! status: ${response.status}`
            );
          }
          degovConfigRaw = await response.text();
          break;
        } else {
          // read from file system
          const filePath = path.isAbsolute(degovConfigPath)
            ? degovConfigPath
            : path.join(process.cwd(), degovConfigPath);
          await fs.access(filePath); // Check if file exists
          degovConfigRaw = await fs.readFile(filePath, "utf-8");
          break;
        }
      } catch (e) {
        console.error(e);
      }

      await setTimeout(1000);
    }
    if (!degovConfigRaw) {
      throw new Error(`cannot read config file from ${degovConfigPath}`);
    }
    console.log(`loaded config from ${degovConfigPath}`);
    return degovConfigRaw;
  }

  async load(): Promise<DegovConfig> {
    const configRaw = await this.readConfigRaw();
    const degovConfig = yaml.parse(configRaw);

    const { code, chain, indexer, contracts } = degovConfig;
    let rpcs = chain.rpcs ?? [];
    if (indexer.rpc) {
      rpcs = [indexer.rpc, ...rpcs];
    }
    if (!rpcs || rpcs.length === 0) {
      const pickedRpcs = await this.pickRpcs(chain.id);
      rpcs.push(...pickedRpcs);
    }
    const endpoint: DegovConfigEndpoint = {
      id: chain.id,
      rpcs,
    };

    const contractNames = Object.keys(contracts);
    const indexContracts: DegovConfigIndexLogContract[] = contractNames.map(
      (item) => {
        const c = contracts[item];
        let addr = c.address ? c.address : c;
        return {
          name: item,
          address: addr,
          standard: c.standard,
        };
      }
    );

    const indexLog: DegovConfigIndexLog = {
      startBlock: indexer.startBlock,
      contracts: indexContracts,
    };
    return {
      code,
      endpoint,
      indexLog,
      gateway: indexer.gateway,
    };
  }
}
