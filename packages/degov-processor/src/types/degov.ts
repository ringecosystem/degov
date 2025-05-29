export interface DgvProposalCreated {
  id: string;
  proposalId: string;
  proposer: string;
  targets: string[];
  values: string[];
  signatures: string[];
  calldatas: string[];
  voteStart: bigint;
  voteEnd: bigint;
  description: string;
  blockNumber: bigint;
  blockTimestamp: bigint;
  transactionHash: string;
}

export interface DgvProposal {
  id: string;
  proposalId: string;
  proposer: string;
  targets: string[];
  values: string[];
  signatures: string[];
  calldatas: string[];
  voteStart: bigint;
  voteEnd: bigint;
  description: string;
  blockNumber: bigint;
  blockTimestamp: bigint;
  transactionHash: string;
  voters: DgvVoteCastGroup[];
  metricsVotesCount?: number;
  metricsVotesWithParamsCount?: number;
  metricsVotesWithoutParamsCount?: number;
  metricsVotesWeightForSum?: bigint;
  metricsVotesWeightAgainstSum?: bigint;
  metricsVotesWeightAbstainSum?: bigint;
}

export interface DgvVoteCastGroup {
  id: string;
  // proposal: Proposal
  type: string;
  voter: string;
  refProposalId: string;
  support: number;
  weight: bigint;
  reason: string;
  params?: string;
  blockNumber: bigint;
  blockTimestamp: bigint;
  transactionHash: string;
}

export interface DataMetricOptions {
  proposalsCount?: number;
  votesCount?: number;
  votesWithParamsCount?: number;
  votesWithoutParamsCount?: number;
  votesWeightForSum?: bigint;
  votesWeightAgainstSum?: bigint;
  votesWeightAbstainSum?: bigint;
}

export interface DgvProposalQueued {
  id: string;
  proposalId: string;
  etaSeconds: bigint;
  blockNumber: bigint;
  blockTimestamp: bigint;
  transactionHash: string;
}

export interface DgvProposalExecuted {
  id: string;
  proposalId: string;
  blockNumber: bigint;
  blockTimestamp: bigint;
  transactionHash: string;
}

export interface DgvProposalCanceled {
  id: string;
  proposalId: string;
  blockNumber: bigint;
  blockTimestamp: bigint;
  transactionHash: string;
}

export interface DgvVoteCast {
  id: string;
  voter: string;
  proposalId: string;
  support: number;
  weight: bigint;
  reason: string;
  blockNumber: bigint;
  blockTimestamp: bigint;
  transactionHash: string;
}

export interface DgvVoteCastWithParams {
  id: string;
  voter: string;
  proposalId: string;
  support: number;
  weight: bigint;
  reason: string;
  params: string;
  blockNumber: bigint;
  blockTimestamp: bigint;
  transactionHash: string;
}

export interface DgvDelegateChanged {
  id: string;
  delegator: string;
  fromDelegate: string;
  toDelegate: string;
  blockNumber: bigint;
  blockTimestamp: bigint;
  transactionHash: string;
}

export interface DgvDelegateMapping {
  id: string;
  from: string;
  to: string;
  blockNumber: bigint;
  blockTimestamp: bigint;
  transactionHash: string;
}

export interface DgvDelegateRolling {
  id: string;
  delegator: string;
  fromDelegate: string;
  toDelegate: string;
  blockNumber: bigint;
  blockTimestamp: bigint;
  transactionHash: string;
  fromPreviousVotes?: bigint;
  fromNewVotes?: bigint;
  toPreviousVotes?: bigint;
  toNewVotes?: bigint;
}

export interface DgvDelegate {
  id: string;
  fromDelegate: string;
  toDelegate: string;
  blockNumber: bigint;
  blockTimestamp: bigint;
  transactionHash: string;
  power: bigint;
}

export interface DgvDelegateVotesChanged {
  id: string;
  delegate: string;
  previousVotes: bigint;
  newVotes: bigint;
  blockNumber: bigint;
  blockTimestamp: bigint;
  transactionHash: string;
}

export interface DgvContributor {
  id: string;
  blockNumber: bigint;
  blockTimestamp: bigint;
  transactionHash: string;
  power: bigint;
}

export interface DgvTokenTransfer {
  id: string;
  from: string;
  to: string;
  value: bigint;
  standard: string;
  blockNumber: bigint;
  blockTimestamp: bigint;
  transactionHash: string;
}
