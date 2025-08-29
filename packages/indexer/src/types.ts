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

export type ContractName = "governor" | "governorToken";

export interface IndexerProcessorConfig {
  chainId: number;
  code: string;
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
  standard?: string;
}

export interface IndexerProcessorState {
  running: boolean;
}
