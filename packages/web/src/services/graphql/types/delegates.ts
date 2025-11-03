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

export type DelegateMappingItem = {
  blockNumber: string;
  blockTimestamp: string;
  from: string;
  id: string;
  to: string;
  transactionHash: string;
};

export type DelegateMappingResponse = {
  delegateMappings: DelegateMappingItem[];
};

export type DelegateMappingConnectionItem = {
  totalCount: number;
};

export type DelegateMappingConnectionResponse = {
  delegateMappingsConnection: DelegateMappingConnectionItem;
};

export type DelegateConnectionItem = {
  totalCount: number;
};

export type DelegateConnectionResponse = {
  delegatesConnection: DelegateConnectionItem;
};
