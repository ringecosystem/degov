import { ClockMode } from "./chaintool";

export type ProjectedProposalState =
  | "Pending"
  | "Active"
  | "Canceled"
  | "Defeated"
  | "Succeeded"
  | "Queued"
  | "Expired"
  | "Executed";

export interface ProjectionStateInput {
  clockMode: ClockMode;
  proposalSnapshot: bigint;
  proposalDeadline: bigint;
  quorum: bigint;
  votesFor: bigint;
  votesAgainst: bigint;
  votesAbstain: bigint;
  currentTimepoint: bigint;
  currentTimestampMs: bigint;
  hasCanceledEvent: boolean;
  hasExecutedEvent: boolean;
  hasQueuedEvent: boolean;
  queueReadyAt?: bigint;
  queueExpiresAt?: bigint;
  timelockAddress?: string | null;
}

export interface ReconciliationCheck<T = bigint | string | undefined> {
  field: string;
  projected: T;
  onChain: T;
  matches: boolean;
  details?: string;
}

export const GOVERNOR_STATE_NAMES: ProjectedProposalState[] = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
];

export function governorStateName(
  value: bigint | number
): ProjectedProposalState | `Unknown(${string})` {
  const index = Number(value);
  return GOVERNOR_STATE_NAMES[index] ?? `Unknown(${value.toString()})`;
}

export function compareScalarField<T>(
  field: string,
  projected: T,
  onChain: T,
  details?: string
): ReconciliationCheck<T> {
  return {
    field,
    projected,
    onChain,
    matches: projected === onChain,
    details,
  };
}

export function deriveProjectedProposalState(
  input: ProjectionStateInput
): ProjectedProposalState {
  if (input.hasExecutedEvent) {
    return "Executed";
  }

  if (input.hasCanceledEvent) {
    return "Canceled";
  }

  if (input.currentTimepoint <= input.proposalSnapshot) {
    return "Pending";
  }

  if (input.currentTimepoint <= input.proposalDeadline) {
    return "Active";
  }

  const hasQuorum =
    input.votesFor + input.votesAgainst + input.votesAbstain >= input.quorum;
  const votePassed = input.votesFor > input.votesAgainst;

  if (!hasQuorum || !votePassed) {
    return "Defeated";
  }

  const hasTimelock =
    Boolean(input.timelockAddress) ||
    input.hasQueuedEvent ||
    input.queueReadyAt !== undefined ||
    input.queueExpiresAt !== undefined;

  if (!hasTimelock) {
    return "Succeeded";
  }

  if (
    input.queueExpiresAt !== undefined &&
    input.currentTimestampMs > input.queueExpiresAt
  ) {
    return "Expired";
  }

  if (
    input.hasQueuedEvent ||
    input.queueReadyAt !== undefined ||
    input.queueExpiresAt !== undefined
  ) {
    return "Queued";
  }

  return "Succeeded";
}
