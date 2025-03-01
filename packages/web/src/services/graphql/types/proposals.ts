// 基础类型定义
export type ID = string;
export type BigInt = string;
export type Address = string;

export type ProposalItem = {
  id: string;
  proposalId: string;
  blockNumber?: number;
  blockTimestamp?: number;
  calldatas?: string[];
  description?: string;
  signatures?: string[];
  targets?: string[];
  voteEnd?: number;
  voteStart?: number;
};

// 分页信息类型
export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string;
}

// 提案列表结果类型
export interface ProposalListResult {
  proposals: ProposalItem[];
  pageInfo: PageInfo;
  totalCount: number;
  loading: boolean;
  error: Error | null;
  fetchNextPage: () => void;
}
