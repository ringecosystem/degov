import {
  loadKnownTokenAccounts,
  QueryableDataSource,
} from "./known-accounts";
import { onchainRefreshTaskId } from "./task";

export interface SeedReconcileOnchainRefreshTasksOptions {
  chainId: number;
  daoCode?: string | null;
  governorAddress: string;
  tokenAddress: string;
  blockNumber: bigint;
  blockTimestamp: bigint;
  now?: bigint;
  chunkSize?: number;
  maxAccountsToScan?: number;
  startAfterAccount?: string;
}

export async function seedReconcileOnchainRefreshTasks(
  dataSource: QueryableDataSource,
  options: SeedReconcileOnchainRefreshTasksOptions,
) {
  const accounts = await loadKnownTokenAccounts(dataSource, options);
  let alreadySeeded = 0;
  let seeded = 0;
  const accountsKnown = accounts.length;
  const maxAccountsToScan = options.maxAccountsToScan;
  const startIndex = findSeedStartIndex(accounts, options.startAfterAccount);
  const scanLimit = maxAccountsToScan ?? accounts.length;
  const accountsToScan = accounts.slice(startIndex, startIndex + scanLimit);
  const accountsScanned = accountsToScan.length;
  const nextStartAfterAccount = accountsToScan[accountsToScan.length - 1];
  const seedLimitReached = startIndex + accountsScanned < accounts.length;

  const accountChunks = chunk(accountsToScan, options.chunkSize ?? 500);
  for (let index = 0; index < accountChunks.length; index += 1) {
    const accountChunk = accountChunks[index];
    const seededAccounts = await loadReconcileSeededAccounts(
      dataSource,
      options,
      accountChunk,
    );
    alreadySeeded += seededAccounts.size;

    const accountsToSeed = accountChunk.filter(
      (account) => !seededAccounts.has(account.toLowerCase()),
    );
    if (accountsToSeed.length > 0) {
      await upsertReconcileOnchainRefreshTasks(
        dataSource,
        options,
        accountsToSeed,
      );
      seeded += accountsToSeed.length;
    }
  }

  return {
    accountsKnown,
    accountsScanned,
    alreadySeeded,
    seeded,
    seedLimitReached,
    nextStartAfterAccount,
  };
}

function findSeedStartIndex(accounts: string[], startAfterAccount?: string) {
  if (!startAfterAccount) {
    return 0;
  }
  const normalizedStartAfterAccount = startAfterAccount.toLowerCase();
  const index = accounts.findIndex(
    (account) => account.toLowerCase() > normalizedStartAfterAccount,
  );
  return index === -1 ? 0 : index;
}

async function upsertReconcileOnchainRefreshTasks(
  dataSource: QueryableDataSource,
  options: SeedReconcileOnchainRefreshTasksOptions,
  accounts: string[],
) {
  const now = options.now ?? BigInt(Date.now());
  const governorAddress = options.governorAddress.toLowerCase();
  const tokenAddress = options.tokenAddress.toLowerCase();
  const normalizedAccounts = accounts.map((account) => account.toLowerCase());
  const ids = normalizedAccounts.map((account) =>
    onchainRefreshTaskId({
      chainId: options.chainId,
      governorAddress,
      tokenAddress,
      account,
    }),
  );

  await dataSource.query(
    `
      INSERT INTO onchain_refresh_task (
        id,
        chain_id,
        dao_code,
        governor_address,
        token_address,
        account,
        refresh_balance,
        refresh_power,
        reason,
        first_seen_block_number,
        last_seen_block_number,
        last_seen_block_timestamp,
        last_seen_transaction_hash,
        status,
        attempts,
        next_run_at,
        pending_after_lock,
        created_at,
        updated_at
      )
      SELECT
        input.id,
        $1,
        $2,
        $3,
        $4,
        input.account,
        true,
        true,
        'reconcile',
        $5,
        $5,
        $6,
        'reconcile',
        'pending',
        0,
        $7,
        false,
        $7,
        $7
      FROM unnest($8::text[], $9::text[]) AS input(id, account)
      ON CONFLICT (id) DO UPDATE SET
        dao_code = COALESCE(EXCLUDED.dao_code, onchain_refresh_task.dao_code),
        refresh_balance = onchain_refresh_task.refresh_balance OR EXCLUDED.refresh_balance,
        refresh_power = onchain_refresh_task.refresh_power OR EXCLUDED.refresh_power,
        reason = (
          SELECT string_agg(reason_item, '+' ORDER BY reason_item)
          FROM (
            SELECT DISTINCT btrim(reason_item) AS reason_item
            FROM unnest(string_to_array(onchain_refresh_task.reason || '+' || EXCLUDED.reason, '+')) AS reason_item
            WHERE btrim(reason_item) <> ''
          ) merged_reasons
        ),
        last_seen_block_number = CASE
          WHEN onchain_refresh_task.status = 'processing'
            OR onchain_refresh_task.locked_at IS NOT NULL
          THEN onchain_refresh_task.last_seen_block_number
          ELSE EXCLUDED.last_seen_block_number
        END,
        last_seen_block_timestamp = CASE
          WHEN onchain_refresh_task.status = 'processing'
            OR onchain_refresh_task.locked_at IS NOT NULL
          THEN onchain_refresh_task.last_seen_block_timestamp
          ELSE EXCLUDED.last_seen_block_timestamp
        END,
        last_seen_transaction_hash = CASE
          WHEN onchain_refresh_task.status = 'processing'
            OR onchain_refresh_task.locked_at IS NOT NULL
          THEN onchain_refresh_task.last_seen_transaction_hash
          ELSE EXCLUDED.last_seen_transaction_hash
        END,
        status = CASE
          WHEN onchain_refresh_task.status = 'processing'
            OR onchain_refresh_task.locked_at IS NOT NULL
          THEN onchain_refresh_task.status
          ELSE 'pending'
        END,
        next_run_at = CASE
          WHEN onchain_refresh_task.status = 'processing'
            OR onchain_refresh_task.locked_at IS NOT NULL
          THEN onchain_refresh_task.next_run_at
          ELSE EXCLUDED.next_run_at
        END,
        locked_at = CASE
          WHEN onchain_refresh_task.status = 'processing'
            OR onchain_refresh_task.locked_at IS NOT NULL
          THEN onchain_refresh_task.locked_at
          ELSE NULL
        END,
        locked_by = CASE
          WHEN onchain_refresh_task.status = 'processing'
            OR onchain_refresh_task.locked_at IS NOT NULL
          THEN onchain_refresh_task.locked_by
          ELSE NULL
        END,
        processed_at = CASE
          WHEN onchain_refresh_task.status = 'processing'
            OR onchain_refresh_task.locked_at IS NOT NULL
          THEN onchain_refresh_task.processed_at
          ELSE NULL
        END,
        error = CASE
          WHEN onchain_refresh_task.status = 'processing'
            OR onchain_refresh_task.locked_at IS NOT NULL
          THEN onchain_refresh_task.error
          ELSE NULL
        END,
        pending_after_lock = CASE
          WHEN onchain_refresh_task.status = 'processing'
            OR onchain_refresh_task.locked_at IS NOT NULL
          THEN true
          ELSE false
        END,
        pending_after_lock_block_number = CASE
          WHEN onchain_refresh_task.status = 'processing'
            OR onchain_refresh_task.locked_at IS NOT NULL
          THEN GREATEST(
            COALESCE(onchain_refresh_task.pending_after_lock_block_number, 0),
            EXCLUDED.last_seen_block_number
          )
          ELSE NULL
        END,
        pending_after_lock_block_timestamp = CASE
          WHEN onchain_refresh_task.status = 'processing'
            OR onchain_refresh_task.locked_at IS NOT NULL
          THEN CASE
            WHEN onchain_refresh_task.pending_after_lock_block_number IS NULL
              OR EXCLUDED.last_seen_block_number >= onchain_refresh_task.pending_after_lock_block_number
            THEN EXCLUDED.last_seen_block_timestamp
            ELSE onchain_refresh_task.pending_after_lock_block_timestamp
          END
          ELSE NULL
        END,
        pending_after_lock_transaction_hash = CASE
          WHEN onchain_refresh_task.status = 'processing'
            OR onchain_refresh_task.locked_at IS NOT NULL
          THEN CASE
            WHEN onchain_refresh_task.pending_after_lock_block_number IS NULL
              OR EXCLUDED.last_seen_block_number >= onchain_refresh_task.pending_after_lock_block_number
            THEN EXCLUDED.last_seen_transaction_hash
            ELSE onchain_refresh_task.pending_after_lock_transaction_hash
          END
          ELSE NULL
        END,
        updated_at = EXCLUDED.updated_at
    `,
    [
      options.chainId,
      options.daoCode ?? null,
      governorAddress,
      tokenAddress,
      options.blockNumber.toString(),
      options.blockTimestamp.toString(),
      now.toString(),
      ids,
      normalizedAccounts,
    ],
  );
}

async function loadReconcileSeededAccounts(
  dataSource: QueryableDataSource,
  options: SeedReconcileOnchainRefreshTasksOptions,
  accounts: string[],
): Promise<Set<string>> {
  if (accounts.length === 0) {
    return new Set();
  }

  const rows = await dataSource.query(
    `
      WITH input_accounts AS (
        SELECT *
        FROM unnest($1::text[], $2::text[]) AS input(id, account)
      ),
      latest_activity AS (
        SELECT account, MAX(block_number) AS block_number
        FROM (
          SELECT lower(delegate) AS account, block_number
          FROM delegate_votes_changed
          WHERE chain_id = $3
            AND lower(governor_address) = lower($4)
            AND lower(delegate) = ANY($2::text[])
          UNION ALL
          SELECT lower(delegator) AS account, block_number
          FROM delegate_changed
          WHERE chain_id = $3
            AND lower(governor_address) = lower($4)
            AND lower(delegator) = ANY($2::text[])
          UNION ALL
          SELECT lower(from_delegate) AS account, block_number
          FROM delegate_changed
          WHERE chain_id = $3
            AND lower(governor_address) = lower($4)
            AND lower(from_delegate) = ANY($2::text[])
          UNION ALL
          SELECT lower(to_delegate) AS account, block_number
          FROM delegate_changed
          WHERE chain_id = $3
            AND lower(governor_address) = lower($4)
            AND lower(to_delegate) = ANY($2::text[])
          UNION ALL
          SELECT lower("from") AS account, block_number
          FROM token_transfer
          WHERE chain_id = $3
            AND lower(governor_address) = lower($4)
            AND lower("from") = ANY($2::text[])
          UNION ALL
          SELECT lower("to") AS account, block_number
          FROM token_transfer
          WHERE chain_id = $3
            AND lower(governor_address) = lower($4)
            AND lower("to") = ANY($2::text[])
        ) account_activity
        GROUP BY account
      )
      SELECT lower(input_accounts.account) AS account
      FROM input_accounts
      JOIN onchain_refresh_task task ON task.id = input_accounts.id
      LEFT JOIN latest_activity ON latest_activity.account = lower(input_accounts.account)
      WHERE (
          task.status IN ('pending', 'processing')
          OR COALESCE(latest_activity.block_number, 0) <= task.last_seen_block_number
        )
        AND EXISTS (
          SELECT 1
          FROM unnest(string_to_array(task.reason, '+')) AS reason_item
          WHERE btrim(reason_item) = 'reconcile'
        )
    `,
    [
      accounts.map((account) =>
        onchainRefreshTaskId({
          chainId: options.chainId,
          governorAddress: options.governorAddress,
          tokenAddress: options.tokenAddress,
          account,
        }),
      ),
      accounts.map((account) => account.toLowerCase()),
      options.chainId,
      options.governorAddress,
    ],
  );

  return new Set(rows.map((row) => String(row.account).toLowerCase()));
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  const normalizedSize = Math.max(1, size);
  for (let index = 0; index < items.length; index += normalizedSize) {
    chunks.push(items.slice(index, index + normalizedSize));
  }
  return chunks;
}
