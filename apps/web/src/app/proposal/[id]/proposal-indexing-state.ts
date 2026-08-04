export const PROPOSAL_INDEXING_PROBLEM_MS = 30 * 60 * 1000;

export type ProposalMissingState =
  | "checking"
  | "indexing"
  | "problem"
  | "not-found";

function isGovernorNonexistentProposalError(error: unknown) {
  if (!error) {
    return false;
  }

  const message =
    error instanceof Error ? error.message : JSON.stringify(error);

  return /GovernorNonexistentProposal|nonexistent proposal/i.test(message);
}

export function getProposalMissingState({
  chainExists,
  chainCheckPending,
  chainCheckError,
  missingObservedAt,
  now,
}: {
  chainExists: boolean;
  chainCheckPending: boolean;
  chainCheckError: unknown;
  missingObservedAt: number | null;
  now: number;
}): ProposalMissingState {
  if (chainExists) {
    const elapsed = missingObservedAt ? now - missingObservedAt : 0;

    if (elapsed >= PROPOSAL_INDEXING_PROBLEM_MS) {
      return "problem";
    }

    return "indexing";
  }

  if (chainCheckPending) {
    return "checking";
  }

  if (isGovernorNonexistentProposalError(chainCheckError)) {
    return "not-found";
  }

  return "checking";
}
