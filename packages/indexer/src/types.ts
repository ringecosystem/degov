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
  rpcs: string[];

  finalityConfirmation: number;
  capacity?: number;
  maxBatchCallSize?: number;
  gateway?: string;
  startBlock: number;
  endBlock?: number;

  works: IndexerWork[]

  state: IndexerProcessorState;
}

export interface IndexerWork {
  daoCode: string;
  contracts: IndexerContract[];
}

export interface IndexerContract {
  name: ContractName;
  address: `0x${string}`;
  standard?: string;
}

export interface IndexerProcessorState {
  running: boolean;
}
