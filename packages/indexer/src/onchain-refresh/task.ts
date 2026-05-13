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
  findOne?: (
    entity: typeof OnchainRefreshTask,
    options: { where: { id: string } },
  ) => Promise<OnchainRefreshTask | undefined>;
  insert: (entity: OnchainRefreshTask) => Promise<void>;
  save?: (entity: OnchainRefreshTask) => Promise<void>;
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
    return 60_000n;
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
  const existing = store.findOne
    ? await store.findOne(OnchainRefreshTask, { where: { id } })
    : undefined;

  if (existing) {
    existing.daoCode = input.daoCode ?? existing.daoCode;
    existing.refreshBalance = existing.refreshBalance || input.refreshBalance;
    existing.refreshPower = existing.refreshPower || input.refreshPower;
    existing.reason = mergeReasons(existing.reason, input.reason);
    existing.lastSeenBlockNumber = input.blockNumber;
    existing.lastSeenBlockTimestamp = input.blockTimestamp;
    existing.lastSeenTransactionHash = input.transactionHash;
    existing.status = "pending";
    existing.nextRunAt = nextRunAt;
    existing.lockedAt = undefined;
    existing.lockedBy = undefined;
    existing.processedAt = undefined;
    existing.error = undefined;
    existing.updatedAt = now;
    if (store.save) {
      await store.save(existing);
    } else {
      await store.insert(existing);
    }
    return existing;
  }

  const task = new OnchainRefreshTask({
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
    createdAt: now,
    updatedAt: now,
  });
  await store.insert(task);
  return task;
}

function normalizeAddress(value: string) {
  return DegovIndexerHelpers.normalizeAddress(value) ?? value.toLowerCase();
}

function mergeReasons(current: string, next: string) {
  if (current === next) {
    return current;
  }
  const reasons = new Set(
    current
      .split("+")
      .concat(next.split("+"))
      .map((item) => item.trim())
      .filter(Boolean),
  );
  return [...reasons].sort().join("+");
}
