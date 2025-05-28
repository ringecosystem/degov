export const evmFieldSelection = {
  transaction: {
    from: true,
    value: true,
    hash: true,
  },
  log: {
    transactionHash: true,
  },
};

export type EvmFieldSelection = typeof evmFieldSelection;



export enum MetricsId {
  global = "global",
}

export interface DegovConfig {
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

