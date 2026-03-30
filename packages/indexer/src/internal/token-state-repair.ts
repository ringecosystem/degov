const zeroAddress = "0x0000000000000000000000000000000000000000";

export interface DelegationFallbackRow {
  delegator: string;
  toDelegate: string;
}

export interface LatestDelegationChangeRow {
  delegator: string;
  toDelegate: string;
}

export interface EffectiveDelegationRow {
  delegator: string;
  toDelegate: string;
}

export interface MappingAggregateRow {
  delegator: string;
  toDelegate: string;
  power: bigint;
}

export interface ContributorAggregateRow {
  contributorId: string;
  power: bigint;
  delegatesCountAll: number;
  delegatesCountEffective: number;
}

function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

function normalizeNullableAddress(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = normalizeAddress(value);
  return normalized === zeroAddress ? undefined : normalized;
}

export function selectEffectiveDelegations(options: {
  fallbackRows: DelegationFallbackRow[];
  latestChanges: LatestDelegationChangeRow[];
}): EffectiveDelegationRow[] {
  const delegations = new Map<string, string>();

  for (const row of options.fallbackRows) {
    const delegator = normalizeAddress(row.delegator);
    const toDelegate = normalizeNullableAddress(row.toDelegate);
    if (toDelegate) {
      delegations.set(delegator, toDelegate);
    }
  }

  for (const row of options.latestChanges) {
    const delegator = normalizeAddress(row.delegator);
    const toDelegate = normalizeNullableAddress(row.toDelegate);
    if (!toDelegate) {
      delegations.delete(delegator);
      continue;
    }

    delegations.set(delegator, toDelegate);
  }

  return [...delegations.entries()]
    .map(([delegator, toDelegate]) => ({
      delegator,
      toDelegate,
    }))
    .sort((left, right) => left.delegator.localeCompare(right.delegator));
}

export function aggregateContributorsFromMappings(
  mappings: MappingAggregateRow[],
): ContributorAggregateRow[] {
  const aggregates = new Map<string, ContributorAggregateRow>();

  for (const mapping of mappings) {
    const contributorId = normalizeAddress(mapping.toDelegate);
    const power = mapping.power < 0n ? 0n : mapping.power;
    const current =
      aggregates.get(contributorId) ??
      {
        contributorId,
        power: 0n,
        delegatesCountAll: 0,
        delegatesCountEffective: 0,
      };

    current.power += power;
    current.delegatesCountAll += 1;
    if (power !== 0n) {
      current.delegatesCountEffective += 1;
    }

    aggregates.set(contributorId, current);
  }

  return [...aggregates.values()].sort((left, right) =>
    left.contributorId.localeCompare(right.contributorId),
  );
}
