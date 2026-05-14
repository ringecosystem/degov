import { OnchainRefreshTask } from "../model";
import { DegovIndexerHelpers } from "../internal/helpers";

export type OnchainRefreshReason =
  | "transfer"
  | "delegate-change"
  | "delegate-votes-changed"
  | "reconcile";

export type OnchainRefreshStatus =
  | "pending"
  | "processing"
  | "processed"
  | "failed";

export interface OnchainRefreshTaskScope {
  chainId: number;
  daoCode?: string | null;
  governorAddress: string;
  tokenAddress: string;
}

export interface OnchainRefreshTaskInput extends OnchainRefreshTaskScope {
  account: string;
  refreshBalance: boolean;
  refreshPower: boolean;
  reason: OnchainRefreshReason;
  blockNumber: bigint;
  blockTimestamp: bigint;
  transactionHash: string;
  now?: bigint;
  debounceMs?: bigint;
}

export interface OnchainRefreshTaskStore {
  query?: (sql: string, params?: unknown[]) => Promise<any[]>;
}

export function onchainRefreshTaskId(options: {
  chainId: number;
  governorAddress: string;
  tokenAddress: string;
  account: string;
}) {
  return [
    options.chainId,
    normalizeAddress(options.governorAddress),
    normalizeAddress(options.tokenAddress),
    normalizeAddress(options.account),
  ].join(":");
}

export function parseOnchainEventReadsEnabled(
  value = process.env.DEGOV_INDEXER_ONCHAIN_EVENT_READS_ENABLED,
) {
  const normalized = (value ?? "false").trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new Error(
    `DEGOV_INDEXER_ONCHAIN_EVENT_READS_ENABLED must be a boolean. Received: ${value}`,
  );
}

export function parseDebounceMs(
  value = process.env.DEGOV_ONCHAIN_REFRESH_DEBOUNCE_MS,
) {
  if (!value) {
    return 120_000n;
  }
  const parsed = BigInt(value);
  if (parsed < 0n) {
    throw new Error(
      `DEGOV_ONCHAIN_REFRESH_DEBOUNCE_MS must be non-negative. Received: ${value}`,
    );
  }
  return parsed;
}

export async function upsertOnchainRefreshTask(
  store: OnchainRefreshTaskStore,
  input: OnchainRefreshTaskInput,
) {
  const account = normalizeAddress(input.account);
  const governorAddress = normalizeAddress(input.governorAddress);
  const tokenAddress = normalizeAddress(input.tokenAddress);
  const id = onchainRefreshTaskId({
    chainId: input.chainId,
    governorAddress,
    tokenAddress,
    account,
  });
  const now = input.now ?? BigInt(Date.now());
  const debounceMs = input.debounceMs ?? parseDebounceMs();
  const nextRunAt = now + debounceMs;
  const query = onchainRefreshTaskQuery(store);
  const [row] = await query(
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
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $10,
        $11,
        $12,
        'pending',
        0,
        $13,
        false,
        $14,
        $14
      )
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
      RETURNING
        id,
        chain_id AS "chainId",
        dao_code AS "daoCode",
        governor_address AS "governorAddress",
        token_address AS "tokenAddress",
        account,
        refresh_balance AS "refreshBalance",
        refresh_power AS "refreshPower",
        reason,
        first_seen_block_number AS "firstSeenBlockNumber",
        last_seen_block_number AS "lastSeenBlockNumber",
        last_seen_block_timestamp AS "lastSeenBlockTimestamp",
        last_seen_transaction_hash AS "lastSeenTransactionHash",
        status,
        attempts,
        next_run_at AS "nextRunAt",
        locked_at AS "lockedAt",
        locked_by AS "lockedBy",
        processed_at AS "processedAt",
        error,
        pending_after_lock AS "pendingAfterLock",
        pending_after_lock_block_number AS "pendingAfterLockBlockNumber",
        pending_after_lock_block_timestamp AS "pendingAfterLockBlockTimestamp",
        pending_after_lock_transaction_hash AS "pendingAfterLockTransactionHash",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    [
      id,
      input.chainId,
      input.daoCode ?? null,
      governorAddress,
      tokenAddress,
      account,
      input.refreshBalance,
      input.refreshPower,
      input.reason,
      input.blockNumber.toString(),
      input.blockTimestamp.toString(),
      input.transactionHash,
      nextRunAt.toString(),
      now.toString(),
    ],
  );

  if (row) {
    return new OnchainRefreshTask({
      ...row,
      firstSeenBlockNumber: toBigInt(row.firstSeenBlockNumber),
      lastSeenBlockNumber: toBigInt(row.lastSeenBlockNumber),
      lastSeenBlockTimestamp: toBigInt(row.lastSeenBlockTimestamp),
      nextRunAt: toBigInt(row.nextRunAt),
      lockedAt: toOptionalBigInt(row.lockedAt),
      processedAt: toOptionalBigInt(row.processedAt),
      pendingAfterLockBlockNumber: toOptionalBigInt(row.pendingAfterLockBlockNumber),
      pendingAfterLockBlockTimestamp: toOptionalBigInt(row.pendingAfterLockBlockTimestamp),
      createdAt: toBigInt(row.createdAt),
      updatedAt: toBigInt(row.updatedAt),
    });
  }

  return new OnchainRefreshTask({
    id,
    chainId: input.chainId,
    daoCode: input.daoCode,
    governorAddress,
    tokenAddress,
    account,
    refreshBalance: input.refreshBalance,
    refreshPower: input.refreshPower,
    reason: input.reason,
    firstSeenBlockNumber: input.blockNumber,
    lastSeenBlockNumber: input.blockNumber,
    lastSeenBlockTimestamp: input.blockTimestamp,
    lastSeenTransactionHash: input.transactionHash,
    status: "pending",
    attempts: 0,
    nextRunAt,
    pendingAfterLock: false,
    createdAt: now,
    updatedAt: now,
  });
}

function normalizeAddress(value: string) {
  return DegovIndexerHelpers.normalizeAddress(value) ?? value.toLowerCase();
}

function onchainRefreshTaskQuery(store: OnchainRefreshTaskStore) {
  if (store.query) {
    return store.query.bind(store);
  }

  const storeWithManager = store as OnchainRefreshTaskStore & {
    em?: () => { query: (sql: string, params?: unknown[]) => Promise<any[]> };
  };
  if (typeof storeWithManager.em === "function") {
    return (sql: string, params?: unknown[]) =>
      storeWithManager.em?.().query(sql, params) ?? Promise.resolve([]);
  }

  throw new Error("OnchainRefreshTaskStore must expose query()");
}

function toBigInt(value: string | number | bigint) {
  return typeof value === "bigint" ? value : BigInt(value);
}

function toOptionalBigInt(value: string | number | bigint | null | undefined) {
  if (value === null || value === undefined) {
    return value;
  }
  return toBigInt(value);
}
