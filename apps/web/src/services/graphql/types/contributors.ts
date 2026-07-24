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

export type ContributorPageItem = {
  totalCount: number;
  offset: number;
  limit: number;
  items: Pick<ContributorItem, "id" | "delegatesCountAll">[];
};

export type ContributorPageResponse = {
  contributorsPage: ContributorPageItem;
};

export type DelegateProfilesCountResponse = {
  delegateProfilesCount: number;
};
