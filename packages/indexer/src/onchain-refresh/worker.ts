import { DataSource } from "typeorm";
import { Abi, createPublicClient, http } from "viem";
import { ChainTool, CurrentVotesResult } from "../internal/chaintool";
import { acquireIndexerWriteTransactionLock } from "../database";
import { DegovIndexerHelpers } from "../internal/helpers";
import { seedReconcileOnchainRefreshTasks } from "./seed";

export interface QueryableDataSource {
  query: (sql: string, params?: unknown[]) => Promise<any[]>;
  transaction?: <T>(callback: (manager: QueryableDataSource) => Promise<T>) => Promise<T>;
}

export interface ProcessOnchainRefreshBatchOptions {
  chainId: number;
  daoCode?: string | null;
  governorAddress: string;
  tokenAddress: string;
  rpcs: string[];
  multicallAddress?: string;
  workerId: string;
  batchSize: number;
  multicallChunkSize?: number;
  concurrency?: number;
  maxSyncLagBlocks?: number;
  seedReconcile?: boolean;
  reconcileSeedChunkSize?: number;
  reconcileSeedBatchSize?: number;
  now?: bigint;
  maxAttempts?: number;
  lockTtlMs?: number;
}

interface ClaimedTask {
  id: string;
  chainId: number;
  daoCode?: string | null;
  governorAddress: string;
  tokenAddress: string;
  account: string;
  refreshBalance: boolean;
  refreshPower: boolean;
  attempts: number;
}

interface PreviousContributorState {
  power: bigint;
  balance: bigint;
  delegatesCountAll: number;
  delegatesCountEffective: number;
}

interface TaskSuccess {
  task: ClaimedTask;
  previous?: PreviousContributorState;
  balance: bigint;
  power: CurrentVotesResult;
}

interface TaskFailure {
  task: ClaimedTask;
  error: unknown;
}

export async function processOnchainRefreshBatch(
  dataSource: QueryableDataSource,
  chainTool: ChainTool,
  options: ProcessOnchainRefreshBatchOptions,
) {
  const now = options.now ?? BigInt(Date.now());
  let latestBlock;
  try {
    latestBlock = await chainTool.latestBlock({
      chainId: options.chainId,
      rpcs: options.rpcs,
    });
  } catch (error) {
    return { claimed: 0, processed: 0, failed: 0 };
  }

  let processorHeight: bigint | undefined;
  let syncLagBlocks: bigint | undefined;
  let reconcileOnly = false;
  if (options.maxSyncLagBlocks !== undefined) {
    processorHeight = await loadProcessorHeight(dataSource);
    if (processorHeight === undefined) {
      return { claimed: 0, processed: 0, failed: 0, skipped: "processor-unready" };
    }
    syncLagBlocks = latestBlock.number - processorHeight;
  }

  if (
    options.maxSyncLagBlocks !== undefined &&
    syncLagBlocks !== undefined &&
    syncLagBlocks > BigInt(options.maxSyncLagBlocks)
  ) {
    if (!options.seedReconcile) {
      return {
        claimed: 0,
        processed: 0,
        failed: 0,
        skipped: "sync-lag",
        syncLagBlocks: syncLagBlocks.toString(),
      };
    }
    reconcileOnly = true;
  }

  const reconcileOnlyFields = reconcileOnly && syncLagBlocks !== undefined
    ? {
        syncLagBlocks: syncLagBlocks.toString(),
        claimMode: "reconcile-only",
      }
    : {};

  let seedResult;
  let tasks = await claimPendingTasks(dataSource, options, now, reconcileOnly);
  if (
    tasks.length === 0 &&
    options.seedReconcile &&
    options.maxSyncLagBlocks !== undefined &&
    processorHeight !== undefined
  ) {
    seedResult = await seedReconcileOnchainRefreshTasks(dataSource, {
      chainId: options.chainId,
      daoCode: options.daoCode,
      governorAddress: options.governorAddress,
      tokenAddress: options.tokenAddress,
      blockNumber: processorHeight,
      blockTimestamp: latestBlock.timestampMs,
      now,
      chunkSize: options.reconcileSeedChunkSize,
      maxAccountsToSeed: options.reconcileSeedBatchSize,
    });
    tasks = await claimPendingTasks(dataSource, options, now, reconcileOnly);
  }

  if (tasks.length === 0) {
    return {
      claimed: 0,
      processed: 0,
      failed: 0,
      ...(seedResult ? { seeded: seedResult.seeded } : {}),
      ...(seedResult
        ? { seedLimitReached: seedResult.seedLimitReached }
        : {}),
      ...reconcileOnlyFields,
    };
  }

  const previousByAccount = await loadPreviousContributors(dataSource, tasks);
  const results = await readBatchState(chainTool, options, tasks, previousByAccount, {
    blockNumber: latestBlock.number,
  });
  const successes = results.filter((item): item is TaskSuccess => "balance" in item);
  const failures = results.filter((item): item is TaskFailure => "error" in item);

  if (successes.length > 0) {
    await withTransaction(dataSource, async (manager) => {
      await upsertContributors(manager, options, successes, latestBlock.number, latestBlock.timestampMs);
      await insertBalanceCheckpoints(manager, options, successes, latestBlock.number, latestBlock.timestampMs);
      await insertPowerCheckpoints(manager, options, successes, latestBlock.number, latestBlock.timestampMs);
      await updatePowerMetric(manager, options, successes);
      await markTasksProcessed(manager, successes.map((item) => item.task), now);
    });
  }
  await Promise.all(failures.map((item) => markTaskFailed(dataSource, item.task, options, now, item.error)));

  return {
    claimed: tasks.length,
    processed: successes.length,
    failed: failures.length,
    ...(seedResult ? { seeded: seedResult.seeded } : {}),
    ...(seedResult
      ? { seedLimitReached: seedResult.seedLimitReached }
      : {}),
    ...reconcileOnlyFields,
  };
}

async function loadProcessorHeight(
  dataSource: QueryableDataSource,
): Promise<bigint | undefined> {
  try {
    const rows = await dataSource.query(
      `
        SELECT height
        FROM "squid_processor".status
        WHERE id = 0
      `,
    );
    if (rows.length === 0 || rows[0].height === undefined || rows[0].height === null) {
      return undefined;
    }
    return toBigInt(rows[0].height);
  } catch (error) {
    if (isRelationMissingError(error)) {
      return undefined;
    }
    throw error;
  }
}

async function claimPendingTasks(
  dataSource: QueryableDataSource,
  options: ProcessOnchainRefreshBatchOptions,
  now: bigint,
  reconcileOnly = false,
): Promise<ClaimedTask[]> {
  const lockTtlMs = BigInt(options.lockTtlMs ?? 300_000);
  const staleLockedBefore = now - lockTtlMs;
  const reconcileOnlyCondition = reconcileOnly
    ? `
          AND EXISTS (
            SELECT 1
            FROM unnest(string_to_array(reason, '+')) AS reason_item
            WHERE btrim(reason_item) = 'reconcile'
          )`
    : "";
  return withTransaction(dataSource, async (manager) => {
    const rows = await manager.query(
      `
        SELECT
          id,
          chain_id AS "chainId",
          dao_code AS "daoCode",
          governor_address AS "governorAddress",
          token_address AS "tokenAddress",
          account,
          refresh_balance AS "refreshBalance",
          refresh_power AS "refreshPower",
          attempts
        FROM onchain_refresh_task
        WHERE chain_id = $1
          AND lower(governor_address) = lower($2)
          AND lower(token_address) = lower($3)
          AND (
            (status IN ('pending', 'failed') AND next_run_at <= $4)
            OR (status = 'processing' AND locked_at <= $5)
          )
          ${reconcileOnlyCondition}
        ORDER BY last_seen_block_number ASC, updated_at ASC
        LIMIT $6
        FOR UPDATE SKIP LOCKED
      `,
      [
        options.chainId,
        options.governorAddress,
        options.tokenAddress,
        now.toString(),
        staleLockedBefore.toString(),
        options.batchSize,
      ],
    );

    if (rows.length === 0) {
      return [];
    }

    await manager.query(
      `
        UPDATE onchain_refresh_task
        SET status = 'processing',
            locked_at = $1,
            locked_by = $2,
            attempts = attempts + 1,
            updated_at = $1
        WHERE id = ANY($3)
      `,
      [now.toString(), options.workerId, rows.map((row) => row.id)],
    );

    return rows;
  });
}

async function loadPreviousContributors(
  dataSource: QueryableDataSource,
  tasks: ClaimedTask[],
): Promise<Map<string, PreviousContributorState>> {
  const accounts = tasks.map((task) => task.account.toLowerCase());
  const rows = await dataSource.query(
    `
      SELECT id, power, balance, delegates_count_all AS "delegatesCountAll", delegates_count_effective AS "delegatesCountEffective"
      FROM contributor
      WHERE lower(id) = ANY($1::text[])
    `,
    [accounts],
  );
  return new Map(
    rows.map((row) => [
      String(row.id).toLowerCase(),
      {
        power: toBigInt(row.power),
        balance: toBigInt(row.balance),
        delegatesCountAll: Number(row.delegatesCountAll ?? 0),
        delegatesCountEffective: Number(row.delegatesCountEffective ?? 0),
      },
    ]),
  );
}

async function readBatchState(
  chainTool: ChainTool,
  options: ProcessOnchainRefreshBatchOptions,
  tasks: ClaimedTask[],
  previousByAccount: Map<string, PreviousContributorState>,
  context: {
    blockNumber: bigint;
  },
): Promise<Array<TaskSuccess | TaskFailure>> {
  if (options.multicallAddress && options.rpcs.length > 0) {
    return readBatchStateWithMulticall(options, tasks, previousByAccount, context);
  }

  return mapWithConcurrency(
    tasks,
    options.concurrency ?? 1,
    async (task) => {
      try {
        const previous = previousByAccount.get(task.account.toLowerCase());
        return {
          task,
          previous,
          ...(await readTaskState(chainTool, options, task, previous, context)),
        };
      } catch (error) {
        return { task, error };
      }
    },
  );
}

async function readTaskState(
  chainTool: ChainTool,
  options: ProcessOnchainRefreshBatchOptions,
  task: ClaimedTask,
  previous: PreviousContributorState | undefined,
  context: { blockNumber: bigint },
): Promise<{ balance: bigint; power: CurrentVotesResult }> {
  const previousBalance = previous?.balance ?? 0n;
  const previousPower = previous?.power ?? 0n;
  const [balance, power] = await Promise.all([
    task.refreshBalance
      ? chainTool.tokenBalance({
          chainId: options.chainId,
          contractAddress: options.tokenAddress as `0x${string}`,
          rpcs: options.rpcs,
          account: task.account as `0x${string}`,
          blockNumber: context.blockNumber,
        })
      : Promise.resolve(previousBalance),
    task.refreshPower
      ? chainTool.currentVotesWithSource({
          chainId: options.chainId,
          contractAddress: options.tokenAddress as `0x${string}`,
          rpcs: options.rpcs,
          account: task.account as `0x${string}`,
          blockNumber: context.blockNumber,
        })
      : Promise.resolve({
          method: "getVotes",
          votes: previousPower,
        } satisfies CurrentVotesResult),
  ]);
  return { balance, power };
}

async function readBatchStateWithMulticall(
  options: ProcessOnchainRefreshBatchOptions,
  tasks: ClaimedTask[],
  previousByAccount: Map<string, PreviousContributorState>,
  context: { blockNumber: bigint },
): Promise<Array<TaskSuccess | TaskFailure>> {
  const chunks = chunk(tasks, options.multicallChunkSize ?? 100);
  const results = await mapWithConcurrency(
    chunks,
    options.concurrency ?? 1,
    (items) => readTaskStateChunkWithMulticall(options, items, previousByAccount, context),
  );
  return results.flat();
}

async function readTaskStateChunkWithMulticall(
  options: ProcessOnchainRefreshBatchOptions,
  tasks: ClaimedTask[],
  previousByAccount: Map<string, PreviousContributorState>,
  context: { blockNumber: bigint },
): Promise<Array<TaskSuccess | TaskFailure>> {
  const client = createPublicClient({
    transport: http(options.rpcs[0]),
  });
  const contracts: any[] = [];
  const indexes = new Map<string, { balance?: number; power?: number }>();
  for (const task of tasks) {
    const taskIndexes: { balance?: number; power?: number } = {};
    if (task.refreshBalance) {
      taskIndexes.balance = contracts.push({
        address: options.tokenAddress as `0x${string}`,
        abi: ABI_FUNCTION_BALANCE_OF,
        functionName: "balanceOf",
        args: [task.account as `0x${string}`],
      }) - 1;
    }
    if (task.refreshPower) {
      taskIndexes.power = contracts.push({
        address: options.tokenAddress as `0x${string}`,
        abi: ABI_FUNCTION_GET_VOTES,
        functionName: "getVotes",
        args: [task.account as `0x${string}`],
      }) - 1;
    }
    indexes.set(task.id, taskIndexes);
  }

  let results: any[];
  try {
    results = await (client as any).multicall({
      allowFailure: true,
      blockNumber: context.blockNumber,
      multicallAddress: options.multicallAddress as `0x${string}`,
      contracts,
    });
  } catch (error) {
    return tasks.map((task) => ({ task, error }));
  }

  return tasks.map((task) => {
    try {
      const previous = previousByAccount.get(task.account.toLowerCase());
      const previousBalance = previous?.balance ?? 0n;
      const previousPower = previous?.power ?? 0n;
      const taskIndexes = indexes.get(task.id) ?? {};
      const balanceResult =
        taskIndexes.balance === undefined ? undefined : results[taskIndexes.balance];
      const powerResult =
        taskIndexes.power === undefined ? undefined : results[taskIndexes.power];
      return {
        task,
        previous,
        balance:
          balanceResult === undefined
            ? previousBalance
            : BigInt(readMulticallValue(balanceResult)),
        power:
          powerResult === undefined
            ? { method: "getVotes", votes: previousPower }
            : {
                method: "getVotes",
                votes: BigInt(readMulticallValue(powerResult)),
              },
      };
    } catch (error) {
      return { task, error };
    }
  });
}

function readMulticallValue(result: any) {
  if (result.status !== "success") {
    throw new Error(result.error?.message ?? "multicall item failed");
  }
  return result.result;
}

const ABI_FUNCTION_GET_VOTES: Abi = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "getVotes",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

const ABI_FUNCTION_BALANCE_OF: Abi = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

async function upsertContributors(
  dataSource: QueryableDataSource,
  options: ProcessOnchainRefreshBatchOptions,
  items: TaskSuccess[],
  blockNumber: bigint,
  blockTimestamp: bigint,
) {
  if (items.length === 0) {
    return;
  }
  const governorAddress = normalizeAddress(options.governorAddress);
  const tokenAddress = normalizeAddress(options.tokenAddress);
  const params: unknown[] = [];
  const values = items.map((item, index) => {
    const offset = index * 12;
    params.push(
      item.task.account,
      options.chainId,
      item.task.daoCode ?? options.daoCode ?? null,
      governorAddress,
      tokenAddress,
      blockNumber.toString(),
      blockTimestamp.toString(),
      "onchain-refresh",
      item.power.votes.toString(),
      item.balance.toString(),
      item.previous?.delegatesCountAll ?? 0,
      item.previous?.delegatesCountEffective ?? 0,
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12})`;
  });
  await dataSource.query(
    `
      INSERT INTO contributor (
        id, chain_id, dao_code, governor_address, token_address, contract_address,
        block_number, block_timestamp, transaction_hash, power, balance,
        delegates_count_all, delegates_count_effective
      )
      VALUES ${values.join(", ")}
      ON CONFLICT (id) DO UPDATE SET
        chain_id = EXCLUDED.chain_id,
        dao_code = EXCLUDED.dao_code,
        governor_address = EXCLUDED.governor_address,
        token_address = EXCLUDED.token_address,
        contract_address = EXCLUDED.contract_address,
        block_number = EXCLUDED.block_number,
        block_timestamp = EXCLUDED.block_timestamp,
        transaction_hash = EXCLUDED.transaction_hash,
        power = EXCLUDED.power,
        balance = EXCLUDED.balance
    `,
    params,
  );
}

async function insertBalanceCheckpoints(
  dataSource: QueryableDataSource,
  options: ProcessOnchainRefreshBatchOptions,
  items: TaskSuccess[],
  blockNumber: bigint,
  blockTimestamp: bigint,
) {
  const checkpointItems = items.filter((item) => item.task.refreshBalance);
  if (checkpointItems.length === 0) {
    return;
  }
  const governorAddress = normalizeAddress(options.governorAddress);
  const tokenAddress = normalizeAddress(options.tokenAddress);
  const params: unknown[] = [];
  const values = checkpointItems.map((item, index) => {
    const offset = index * 14;
    const previousBalance = item.previous?.balance ?? 0n;
    params.push(
      `onchain-refresh-balance-${item.task.account}-${blockNumber.toString()}`,
      options.chainId,
      item.task.daoCode ?? options.daoCode ?? null,
      governorAddress,
      tokenAddress,
      item.task.account,
      previousBalance.toString(),
      item.balance.toString(),
      (item.balance - previousBalance).toString(),
      "balanceOf",
      "onchain-refresh",
      blockNumber.toString(),
      blockTimestamp.toString(),
      "onchain-refresh",
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14})`;
  });
  await dataSource.query(
    `
      INSERT INTO token_balance_checkpoint (
        id, chain_id, dao_code, governor_address, token_address, contract_address,
        account, previous_balance, new_balance, delta, source, cause,
        block_number, block_timestamp, transaction_hash
      )
      VALUES ${values.join(", ")}
      ON CONFLICT (id) DO NOTHING
    `,
    params,
  );
}

async function insertPowerCheckpoints(
  dataSource: QueryableDataSource,
  options: ProcessOnchainRefreshBatchOptions,
  items: TaskSuccess[],
  blockNumber: bigint,
  blockTimestamp: bigint,
) {
  const checkpointItems = items.filter((item) => item.task.refreshPower);
  if (checkpointItems.length === 0) {
    return;
  }
  const governorAddress = normalizeAddress(options.governorAddress);
  const tokenAddress = normalizeAddress(options.tokenAddress);
  const params: unknown[] = [];
  const values = checkpointItems.map((item, index) => {
    const offset = index * 16;
    const previousPower = item.previous?.power ?? 0n;
    params.push(
      `onchain-refresh-power-${item.task.account}-${blockNumber.toString()}`,
      options.chainId,
      item.task.daoCode ?? options.daoCode ?? null,
      governorAddress,
      tokenAddress,
      item.task.account,
      "blocknumber",
      blockNumber.toString(),
      previousPower.toString(),
      item.power.votes.toString(),
      (item.power.votes - previousPower).toString(),
      item.power.method,
      "onchain-refresh",
      blockNumber.toString(),
      blockTimestamp.toString(),
      "onchain-refresh",
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16})`;
  });
  await dataSource.query(
    `
      INSERT INTO vote_power_checkpoint (
        id, chain_id, dao_code, governor_address, token_address, contract_address,
        account, clock_mode, timepoint, previous_power, new_power, delta, source, cause,
        block_number, block_timestamp, transaction_hash
      )
      VALUES ${values.join(", ")}
      ON CONFLICT (id) DO NOTHING
    `,
    params,
  );
}

async function updatePowerMetric(
  dataSource: QueryableDataSource,
  options: ProcessOnchainRefreshBatchOptions,
  items: TaskSuccess[],
) {
  const delta = items
    .filter((item) => item.task.refreshPower)
    .reduce((sum, item) => {
      const previousPower = item.previous?.power ?? 0n;
      return sum + item.power.votes - previousPower;
    }, 0n);
  if (delta === 0n) {
    return;
  }
  const governorAddress = normalizeAddress(options.governorAddress);
  const tokenAddress = normalizeAddress(options.tokenAddress);
  await dataSource.query(
    `
      INSERT INTO data_metric (
        id, chain_id, dao_code, governor_address, token_address, contract_address, power_sum
      )
      VALUES ($1, $2, $3, $4, $5, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        chain_id = EXCLUDED.chain_id,
        dao_code = EXCLUDED.dao_code,
        governor_address = EXCLUDED.governor_address,
        token_address = EXCLUDED.token_address,
        contract_address = EXCLUDED.contract_address,
        power_sum = COALESCE(data_metric.power_sum, 0) + EXCLUDED.power_sum
    `,
    [
      "global",
      options.chainId,
      options.daoCode ?? items[0]?.task.daoCode ?? null,
      governorAddress,
      tokenAddress,
      delta.toString(),
    ],
  );
}

async function markTasksProcessed(
  dataSource: QueryableDataSource,
  tasks: ClaimedTask[],
  now: bigint,
) {
  await dataSource.query(
    `
      UPDATE onchain_refresh_task
      SET status = CASE
            WHEN pending_after_lock THEN 'pending'
            ELSE 'processed'
          END,
          locked_at = NULL,
          locked_by = NULL,
          processed_at = CASE
            WHEN pending_after_lock THEN NULL
            ELSE $1::numeric
          END,
          error = NULL,
          last_seen_block_number = COALESCE(
            pending_after_lock_block_number,
            last_seen_block_number
          ),
          last_seen_block_timestamp = COALESCE(
            pending_after_lock_block_timestamp,
            last_seen_block_timestamp
          ),
          last_seen_transaction_hash = COALESCE(
            pending_after_lock_transaction_hash,
            last_seen_transaction_hash
          ),
          pending_after_lock = false,
          pending_after_lock_block_number = NULL,
          pending_after_lock_block_timestamp = NULL,
          pending_after_lock_transaction_hash = NULL,
          updated_at = $1
      WHERE id = ANY($2)
    `,
    [now.toString(), tasks.map((task) => task.id)],
  );
}

async function markTaskFailed(
  dataSource: QueryableDataSource,
  task: ClaimedTask,
  options: ProcessOnchainRefreshBatchOptions,
  now: bigint,
  error: unknown,
) {
  const attempts = task.attempts + 1;
  const backoffMs = BigInt(Math.min(10 * 60_000, 2 ** attempts * 10_000));
  const status = attempts >= (options.maxAttempts ?? 5) ? "failed" : "pending";
  await dataSource.query(
    `
      UPDATE onchain_refresh_task
      SET status = '${status}',
          locked_at = NULL,
          locked_by = NULL,
          next_run_at = $1,
          error = $2,
          updated_at = $3
      WHERE id = $4
    `,
    [
      (now + backoffMs).toString(),
      DegovIndexerHelpers.formatError(error).slice(0, 1000),
      now.toString(),
      task.id,
    ],
  );
}

async function withTransaction<T>(
  dataSource: QueryableDataSource,
  callback: (manager: QueryableDataSource) => Promise<T>,
): Promise<T> {
  if (dataSource.transaction) {
    return dataSource.transaction(async (manager) => {
      await acquireIndexerWriteTransactionLock(manager);
      return callback(manager);
    });
  }
  await dataSource.query("BEGIN");
  try {
    await acquireIndexerWriteTransactionLock(dataSource);
    const result = await callback(dataSource);
    await dataSource.query("COMMIT");
    return result;
  } catch (error) {
    await dataSource.query("ROLLBACK");
    throw error;
  }
}

function toBigInt(value: string | number | bigint | null | undefined): bigint {
  if (value === null || value === undefined) {
    return 0n;
  }
  return typeof value === "bigint" ? value : BigInt(value);
}

function normalizeAddress(value: string) {
  return DegovIndexerHelpers.normalizeAddress(value) ?? value.toLowerCase();
}

function isRelationMissingError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as {
    code?: unknown;
    driverError?: { code?: unknown };
  };
  return candidate.code === "42P01" || candidate.driverError?.code === "42P01";
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  const normalizedSize = Math.max(1, size);
  for (let index = 0; index < items.length; index += normalizedSize) {
    chunks.push(items.slice(index, index + normalizedSize));
  }
  return chunks;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  callback: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await callback(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function createOnchainRefreshDataSource(): Promise<DataSource> {
  const databaseUrl = process.env.DATABASE_URL;
  const ssl = process.env.DB_SSL === "true";
  const dataSource = new DataSource(
    databaseUrl
      ? { type: "postgres", url: databaseUrl, ssl }
      : {
          type: "postgres",
          host: process.env.DB_HOST ?? "localhost",
          port: Number(process.env.DB_PORT ?? 5432),
          username: process.env.DB_USER ?? "postgres",
          password: process.env.DB_PASS ?? "postgres",
          database: process.env.DB_NAME ?? "squid",
          ssl,
        },
  );
  await dataSource.initialize();
  return dataSource;
}
