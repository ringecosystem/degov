export type ContributorItem = {
  blockNumber: string;
  blockTimestamp: string;
  id: string;
  power: string;
  transactionHash: string;
};

export type ContributorResponse = {
  contributors: ContributorItem[];
};
