export interface IndexerProcessorConfig {
  chainId: number;
  rpc: string;
  finalityConfirmation: number;

  capacity?: number;
  maxBatchCallSize?: number;
  gateway?: string;

  logs: IndexerWatchLog[];

  state: IndexerProcessorState,
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
  // private config: IndexerProcessorConfig;

  constructor() {
  }


}
