export type ContributorItem = {
  blockNumber: string;
  blockTimestamp: string;
  lastVoteTimestamp?: string | null;
  delegatesCountAll?: number | null;
  id: string;
  power: string;
  transactionHash: string;
};

export type ContributorResponse = {
  contributors: ContributorItem[];
};
