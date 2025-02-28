// 基础类型定义
export type ID = string;
export type BigInt = string;
export type Address = string;

// 提案状态枚举
export enum ProposalState {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
  CANCELED = "CANCELED",
  DEFEATED = "DEFEATED",
  SUCCEEDED = "SUCCEEDED",
  QUEUED = "QUEUED",
  EXPIRED = "EXPIRED",
  EXECUTED = "EXECUTED",
}

// 提案基础类型
export interface Proposal {
  id: ID;
  proposalId: BigInt;
  proposer: Address;
  targets: Address[];
  values: BigInt[];
  signatures: string[];
  calldatas: string[];
  startBlock: BigInt;
  endBlock: BigInt;
  description: string;
  state: ProposalState;
  createdTimestamp: BigInt;
  createdBlock: BigInt;
  createdTransactionHash: string;
}

// 已取消的提案
export interface ProposalCanceled {
  id: ID;
  proposalId: BigInt;
  canceledTimestamp: BigInt;
  canceledBlock: BigInt;
  canceledTransactionHash: string;
}

// 已创建的提案
export interface ProposalCreated {
  id: ID;
  proposalId: BigInt;
  proposer: Address;
  targets: Address[];
  values: BigInt[];
  signatures: string[];
  calldatas: string[];
  startBlock: BigInt;
  endBlock: BigInt;
  description: string;
  createdTimestamp: BigInt;
  createdBlock: BigInt;
  createdTransactionHash: string;
}

// 已执行的提案
export interface ProposalExecuted {
  id: ID;
  proposalId: BigInt;
  executedTimestamp: BigInt;
  executedBlock: BigInt;
  executedTransactionHash: string;
}

// 已排队的提案
export interface ProposalQueued {
  id: ID;
  proposalId: BigInt;
  eta: BigInt;
  queuedTimestamp: BigInt;
  queuedBlock: BigInt;
  queuedTransactionHash: string;
}

// 分页参数
export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string;
  endCursor: string;
}

// 连接类型
export interface ProposalConnection {
  nodes: Proposal[];
  pageInfo: PageInfo;
  totalCount: number;
}

export interface ProposalCanceledConnection {
  nodes: ProposalCanceled[];
  pageInfo: PageInfo;
  totalCount: number;
}

export interface ProposalCreatedConnection {
  nodes: ProposalCreated[];
  pageInfo: PageInfo;
  totalCount: number;
}

export interface ProposalExecutedConnection {
  nodes: ProposalExecuted[];
  pageInfo: PageInfo;
  totalCount: number;
}

export interface ProposalQueuedConnection {
  nodes: ProposalQueued[];
  pageInfo: PageInfo;
  totalCount: number;
}

// 响应类型
export interface ProposalResponse {
  proposal: Proposal;
}

export interface ProposalsResponse {
  proposals: ProposalConnection;
}

export interface ProposalCreatedByIdResponse {
  proposalCreatedById: ProposalCreated;
}

export interface ProposalCreatedsResponse {
  proposalCreateds: ProposalCreatedConnection;
}

export interface ProposalCreatedsConnectionResponse {
  proposalCreatedsConnection: ProposalCreatedConnection;
}

export interface ProposalCanceledByIdResponse {
  proposalCanceledById: ProposalCanceled;
}

export interface ProposalCanceledsResponse {
  proposalCanceleds: ProposalCanceledConnection;
}

export interface ProposalCanceledsConnectionResponse {
  proposalCanceledsConnection: ProposalCanceledConnection;
}

export interface ProposalExecutedByIdResponse {
  proposalExecutedById: ProposalExecuted;
}

export interface ProposalExecutedsResponse {
  proposalExecuteds: ProposalExecutedConnection;
}

export interface ProposalExecutedsConnectionResponse {
  proposalExecutedsConnection: ProposalExecutedConnection;
}

export interface ProposalQueuedByIdResponse {
  proposalQueuedById: ProposalQueued;
}

export interface ProposalQueuedsResponse {
  proposalQueueds: ProposalQueuedConnection;
}

export interface ProposalQueuedsConnectionResponse {
  proposalQueuedsConnection: ProposalQueuedConnection;
}
