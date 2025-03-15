export type DelegateItem = {
  blockNumber: string;
  blockTimestamp: string;
  fromDelegate: string;
  id: string;
  power: string;
  toDelegate: string;
  transactionHash: string;
};

export type DelegateResponse = {
  delegates: DelegateItem[];
};
