export type ContributorItem = {
  blockNumber: string;
  blockTimestamp: string;
  delegateCount?: number | null;
  id: string;
  power: string;
  transactionHash: string;
};

export type ContributorResponse = {
  contributors: ContributorItem[];
};
