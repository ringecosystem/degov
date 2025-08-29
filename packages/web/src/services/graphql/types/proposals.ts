import type { VoteType } from "@/config/vote";

import type { Address } from "viem";

export type ProposalVoterItem = {
  blockNumber: string;
  blockTimestamp: string;
  id: string;
  params?: string;
  reason: string;
  support: VoteType;
  transactionHash: string;
  type: string;
  voter: Address;
  weight: string;
};
export type ProposalItem = {
  blockNumber: string;
  blockTimestamp: string;
  calldatas: string[];
  description: string;
  id: string;
  proposalId: string;
  proposer: string;
  signatures: string[];
  targets: string[];
  transactionHash: string;
  values: string[];
  voteEnd: string;
  voteStart: string;
  metricsVotesWeightAbstainSum: string;
  metricsVotesWeightAgainstSum: string;
  metricsVotesWeightForSum: string;
  metricsVotesCount: string;
  voters: ProposalVoterItem[];
  signatureContent?: string[];
  discussion?: string;
};

export type ProposalResponse = {
  proposals: ProposalItem[];
};

export type ProposalTotalResponse = {
  proposals: string[];
};

export interface EvmAbiResponse {
  evmAbi: EvmAbiOutput[];
}

export interface EvmAbiOutput {
  abi: string;
  address: string;
  type: 'PROXY' | 'IMPLEMENTATION';
  implementation?: string;
}

export interface EvmAbiInput {
  chain: number;
  contract: string;
}

export type ProposalByIdResponse = {
  proposalCreatedById: ProposalItem;
};

// cancel
export type ProposalCanceledByIdItem = {
  id: string;
  blockNumber: string;
  blockTimestamp: string;
  proposalId: string;
  transactionHash: string;
};
export type ProposalCanceledByIdResponse = {
  proposalCanceleds: ProposalCanceledByIdItem[];
};

// Executed
export type ProposalExecutedByIdItem = {
  id: string;
  blockNumber: string;
  blockTimestamp: string;
  proposalId: string;
  transactionHash: string;
};
export type ProposalExecutedByIdResponse = {
  proposalExecuteds: ProposalExecutedByIdItem[];
};

// Queued
export type ProposalQueuedByIdItem = {
  id: string;
  blockNumber: string;
  blockTimestamp: string;
  etaSeconds: string;
  proposalId: string;
  transactionHash: string;
};
export type ProposalQueuedByIdResponse = {
  proposalQueueds: ProposalQueuedByIdItem[];
};

export type ProposalMetricsItem = {
  memberCount: number;
  powerSum: string;
  proposalsCount: string;
  votesCount: string;
  votesWeightAbstainSum: string;
  votesWeightAgainstSum: string;
  votesWeightForSum: string;
  votesWithParamsCount: string;
  votesWithoutParamsCount: string;
};

export type ProposalMetricsResponse = {
  dataMetrics: ProposalMetricsItem[];
};
