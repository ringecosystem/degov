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
  voters: ProposalVoterItem[];
  signatureContent?: string[];
};

export type ProposalResponse = {
  proposals: ProposalItem[];
};

export type ProposalTotalResponse = {
  proposals: string[];
};

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
  proposalCanceledById: ProposalCanceledByIdItem;
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
  proposalExecutedById: ProposalExecutedByIdItem;
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
  proposalQueuedById: ProposalQueuedByIdItem;
};
