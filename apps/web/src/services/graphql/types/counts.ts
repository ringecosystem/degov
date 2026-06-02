export type CountConnectionItem = {
  totalCount: number;
};

export type GovernanceCounts = {
  proposalsCount: number;
  delegatesCount: number;
};

export type GovernanceCountsResponse = {
  proposalsConnection?: CountConnectionItem | null;
  contributorsConnection?: CountConnectionItem | null;
};

export function resolveGovernanceCounts(
  response?: GovernanceCountsResponse | null
): GovernanceCounts {
  return {
    proposalsCount: response?.proposalsConnection?.totalCount ?? 0,
    delegatesCount: response?.contributorsConnection?.totalCount ?? 0,
  };
}
