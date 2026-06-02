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
export type ProposalListVoterItem = Pick<
  ProposalVoterItem,
  "voter" | "support"
>;

export type ProposalItem = {
  blockNumber: string;
  blockTimestamp: string;
  calldatas: string[];
  chainId?: number | null;
  daoCode?: string | null;
  description: string;
  id: string;
  proposalId: string;
  governorAddress?: string | null;
  proposer: string;
  signatures: string[];
  targets: string[];
  transactionHash: string;
  values: string[];
  voteEnd: string;
  voteStart: string;
  voteStartTimestamp: string;
  voteEndTimestamp: string;
  blockInterval?: string | null;
  clockMode: string;
  proposalDeadline?: string | null;
  proposalEta?: string | null;
  queueReadyAt?: string | null;
  queueExpiresAt?: string | null;
  quorum: string;
  decimals: string;
  timelockAddress?: string | null;
  timelockGracePeriod?: string | null;
  title: string;
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

export type ProposalListItem = {
  blockTimestamp: string;
  chainId?: number | null;
  governorAddress?: string | null;
  id: string;
  proposalId: string;
  proposer: string;
  title: string;
  metricsVotesWeightAbstainSum: string;
  metricsVotesWeightAgainstSum: string;
  metricsVotesWeightForSum: string;
  voters: ProposalListVoterItem[];
};

export type ProposalListResponse = {
  proposals: ProposalListItem[];
};

export type ProposalDescriptionItem = {
  chainId?: number | null;
  governorAddress?: string | null;
  proposalId: string;
  description: string;
};

export type ProposalDescriptionResponse = {
  proposals: ProposalDescriptionItem[];
};

export type ProposalVoteRateItem = Pick<
  ProposalItem,
  "id" | "title" | "proposalId" | "blockTimestamp"
> & {
  voters: Array<Pick<ProposalVoterItem, "voter">>;
};

export type ProposalVoteRateResponse = {
  proposals: ProposalVoteRateItem[];
};

export type ProposalTotalItem = Pick<ProposalItem, "proposalId">;

export type ProposalTotalResponse = {
  proposals: ProposalTotalItem[];
};

export interface EvmAbiResponse {
  evmAbi: EvmAbiOutput[];
}

export interface EvmAbiOutput {
  abi: string;
  address: string;
  type: "PROXY" | "IMPLEMENTATION";
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

export type SummaryProposalStateItem = {
  count: number;
  state: string;
};

export type SummaryProposalStatesResponse = {
  summaryProposalStates: SummaryProposalStateItem[];
};
