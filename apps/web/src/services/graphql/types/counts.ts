export type CountPageItem = {
  totalCount: number;
};

export type GovernanceCounts = {
  proposalsCount: number;
  delegatesCount: number;
};

export type GovernanceCountsResponse = {
  proposalsPage?: CountPageItem | null;
  contributorsPage?: CountPageItem | null;
};

export function resolveGovernanceCounts(
  response?: GovernanceCountsResponse | null
): GovernanceCounts {
  return {
    proposalsCount: response?.proposalsPage?.totalCount ?? 0,
    delegatesCount: response?.contributorsPage?.totalCount ?? 0,
  };
}
