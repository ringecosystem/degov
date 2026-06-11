export type CountPageItem = {
  totalCount: number;
};

export type DataMetricCountItem = {
  contributorCount?: number | null;
  holdersCount?: number | null;
};

export type GovernanceCounts = {
  proposalsCount: number;
  delegatesCount: number;
};

export type GovernanceCountsResponse = {
  proposalsPage?: CountPageItem | null;
  dataMetrics?: DataMetricCountItem[] | null;
};

export function resolveGovernanceCounts(
  response?: GovernanceCountsResponse | null
): GovernanceCounts {
  return {
    proposalsCount: response?.proposalsPage?.totalCount ?? 0,
    delegatesCount:
      response?.dataMetrics?.[0]?.holdersCount ??
      response?.dataMetrics?.[0]?.contributorCount ??
      0,
  };
}
