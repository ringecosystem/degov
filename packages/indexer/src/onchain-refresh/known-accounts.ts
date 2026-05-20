export interface QueryableDataSource {
  query(sql: string, parameters?: unknown[]): Promise<any[]>;
  transaction?<T>(
    callback: (entityManager: QueryableDataSource) => Promise<T>
  ): Promise<T>;
}

export interface KnownTokenAccountsOptions {
  chainId: number;
  governorAddress: string;
  tokenAddress?: string;
}

const zeroAddress = "0x0000000000000000000000000000000000000000";

export async function loadKnownTokenAccounts(
  dataSource: QueryableDataSource,
  options: KnownTokenAccountsOptions
): Promise<string[]> {
  const rows = await dataSource.query(
    `
      WITH known_accounts AS (
        SELECT id AS account
        FROM contributor
        WHERE chain_id = $1
          AND lower(governor_address) = lower($2)
        UNION
        SELECT "from" AS account
        FROM delegate_mapping
        WHERE chain_id = $1
          AND lower(governor_address) = lower($2)
        UNION
        SELECT "to" AS account
        FROM delegate_mapping
        WHERE chain_id = $1
          AND lower(governor_address) = lower($2)
        UNION
        SELECT from_delegate AS account
        FROM delegate
        WHERE chain_id = $1
          AND lower(governor_address) = lower($2)
        UNION
        SELECT to_delegate AS account
        FROM delegate
        WHERE chain_id = $1
          AND lower(governor_address) = lower($2)
        UNION
        SELECT "from" AS account
        FROM token_transfer
        WHERE chain_id = $1
          AND lower(governor_address) = lower($2)
        UNION
        SELECT "to" AS account
        FROM token_transfer
        WHERE chain_id = $1
          AND lower(governor_address) = lower($2)
        UNION
        SELECT account
        FROM token_balance_checkpoint
        WHERE chain_id = $1
          AND lower(governor_address) = lower($2)
        UNION
        SELECT account
        FROM vote_power_checkpoint
        WHERE chain_id = $1
          AND lower(governor_address) = lower($2)
        UNION
        SELECT voter AS account
        FROM vote_cast
        WHERE chain_id = $1
          AND lower(governor_address) = lower($2)
        UNION
        SELECT voter AS account
        FROM vote_cast_group
        WHERE chain_id = $1
          AND lower(governor_address) = lower($2)
        UNION
        SELECT delegator AS account
        FROM delegate_changed
        WHERE chain_id = $1
          AND lower(governor_address) = lower($2)
        UNION
        SELECT from_delegate AS account
        FROM delegate_changed
        WHERE chain_id = $1
          AND lower(governor_address) = lower($2)
        UNION
        SELECT to_delegate AS account
        FROM delegate_changed
        WHERE chain_id = $1
          AND lower(governor_address) = lower($2)
        UNION
        SELECT delegate AS account
        FROM delegate_votes_changed
        WHERE chain_id = $1
          AND lower(governor_address) = lower($2)
      )
      SELECT DISTINCT lower(account) AS account
      FROM known_accounts
      WHERE account IS NOT NULL
        AND lower(account) <> $3
      ORDER BY account ASC
    `,
    [options.chainId, options.governorAddress, zeroAddress]
  );

  return rows
    .map((row) => normalizeAddress(row.account))
    .filter((account): account is string => Boolean(account));
}

function normalizeAddress(value: string | null | undefined): string | undefined {
  return value ? value.toLowerCase() : undefined;
}
