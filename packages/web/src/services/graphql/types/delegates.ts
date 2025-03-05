export type DelegateItem = {
  blockNumber: string;
  blockTimestamp: string;
  delegator: string;
  fromDelegate: string;
  fromNewVotes?: string;
  fromPreviousVotes?: string;
  id: string;
  toDelegate: string;
  toNewVotes?: string;
  toPreviousVotes?: string;
  transactionHash: string;
};

export type DelegateResponse = {
  delegates: DelegateItem[];
};
