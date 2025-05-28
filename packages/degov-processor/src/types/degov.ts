export interface DProposalCreated {
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

export interface DProposal {
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
  voters: DVoteCastGroup[];
  metricsVotesCount?: number;
  metricsVotesWithParamsCount?: number;
  metricsVotesWithoutParamsCount?: number;
  metricsVotesWeightForSum?: bigint;
  metricsVotesWeightAgainstSum?: bigint;
  metricsVotesWeightAbstainSum?: bigint;
}

export interface DVoteCastGroup {
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

