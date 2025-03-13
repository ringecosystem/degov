export enum MetricsId {
  global = "global",
}

export interface DegovIndexLog {
  startBlock: number;
  contracts: DegovIndexLogContract[];
}

export interface DegovIndexLogContract {
  name: string;
  address: string;
  standard?: string;
}
