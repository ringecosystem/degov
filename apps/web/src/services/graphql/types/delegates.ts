export type DelegateItem = {
  blockNumber: string;
  blockTimestamp: string;
  fromDelegate: string;
  id: string;
  isCurrent: boolean;
  power: string;
  toDelegate: string;
  transactionHash: string;
};

export type DelegateResponse = {
  delegates: DelegateItem[];
};

export type DelegateMappingItem = {
  blockNumber: string;
  blockTimestamp: string;
  from: string;
  id: string;
  power: string;
  to: string;
  transactionHash: string;
};

export type DelegateMappingResponse = {
  delegateMappings: DelegateMappingItem[];
};

export type DelegateMappingPageItem = {
  totalCount: number;
  offset: number;
  limit: number;
  items: DelegateMappingItem[];
};

export type DelegateMappingPageResponse = {
  delegateMappingsPage: DelegateMappingPageItem;
};

export type DelegatePageItem = {
  totalCount: number;
  offset: number;
  limit: number;
  items: DelegateItem[];
};

export type DelegatePageResponse = {
  delegatesPage: DelegatePageItem;
};
