import { DataSource } from "typeorm";
import { Abi, createPublicClient, http } from "viem";
import { ChainTool, CurrentVotesResult } from "../internal/chaintool";
import { DegovIndexerHelpers } from "../internal/helpers";

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
  now?: bigint;
  maxAttempts?: number;
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

export async function processOnchainRefreshBatch(
  dataSource: QueryableDataSource,
  chainTool: ChainTool,
  options: ProcessOnchainRefreshBatchOptions,
) {
  const now = options.now ?? BigInt(Date.now());
  const tasks = await claimPendingTasks(dataSource, options, now);
  let processed = 0;
  let failed = 0;

  for (const task of tasks) {
    try {
      await processTask(dataSource, chainTool, options, task, now);
      processed += 1;
    } catch (error) {
      failed += 1;
      await markTaskFailed(dataSource, task, options, now, error);
    }
  }

  return {
    claimed: tasks.length,
    processed,
    failed,
  };
}

async function claimPendingTasks(
  dataSource: QueryableDataSource,
  options: ProcessOnchainRefreshBatchOptions,
  now: bigint,
): Promise<ClaimedTask[]> {
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
          AND status IN ('pending', 'failed')
          AND next_run_at <= $4
        ORDER BY last_seen_block_number ASC, updated_at ASC
        LIMIT $5
        FOR UPDATE SKIP LOCKED
      `,
      [
        options.chainId,
        options.governorAddress,
        options.tokenAddress,
        now.toString(),
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

async function processTask(
  dataSource: QueryableDataSource,
  chainTool: ChainTool,
  options: ProcessOnchainRefreshBatchOptions,
  task: ClaimedTask,
  now: bigint,
) {
  const latestBlock = await chainTool.latestBlock({
    chainId: options.chainId,
    rpcs: options.rpcs,
  });
  const [previous] = await dataSource.query(
    `
      SELECT power, balance, delegates_count_all AS "delegatesCountAll", delegates_count_effective AS "delegatesCountEffective"
      FROM contributor
      WHERE lower(id) = lower($1)
      LIMIT 1
    `,
    [task.account],
  );
  const previousPower = toBigInt(previous?.power);
  const previousBalance = toBigInt(previous?.balance);
  const blockNumber = latestBlock.number;
  const blockTimestamp = latestBlock.timestampMs;
  const state = await readTaskState(chainTool, options, task, {
    previousBalance,
    previousPower,
    blockNumber,
  });
  const balance = state.balance;
  const powerResult = state.power;

  await withTransaction(dataSource, async (manager) => {
    await upsertContributor(manager, options, task, balance, powerResult.votes, blockNumber, blockTimestamp, previous);
    if (task.refreshBalance) {
      await insertBalanceCheckpoint(manager, options, task, previousBalance, balance, blockNumber, blockTimestamp);
    }
    if (task.refreshPower) {
      await insertPowerCheckpoint(manager, options, task, previousPower, powerResult, blockNumber, blockTimestamp);
    }
    await manager.query(
      `
        UPDATE onchain_refresh_task
        SET status = 'processed',
            locked_at = NULL,
            locked_by = NULL,
            processed_at = $1,
            error = NULL,
            updated_at = $1
        WHERE id = $2
      `,
      [now.toString(), task.id],
    );
  });
}

async function readTaskState(
  chainTool: ChainTool,
  options: ProcessOnchainRefreshBatchOptions,
  task: ClaimedTask,
  context: {
    previousBalance: bigint;
    previousPower: bigint;
    blockNumber: bigint;
  },
): Promise<{ balance: bigint; power: CurrentVotesResult }> {
  if (options.multicallAddress && options.rpcs.length > 0) {
    try {
      return await readTaskStateWithMulticall(options, task, context);
    } catch (error) {
      console.warn(
        DegovIndexerHelpers.formatLogLine("onchain-refresh.multicall fallback", {
          chainId: options.chainId,
          token: options.tokenAddress,
          task: task.id,
          error: DegovIndexerHelpers.formatError(error),
        }),
      );
    }
  }

  const [balance, power] = await Promise.all([
    task.refreshBalance
      ? chainTool.tokenBalance({
          chainId: options.chainId,
          contractAddress: options.tokenAddress as `0x${string}`,
          rpcs: options.rpcs,
          account: task.account as `0x${string}`,
          blockNumber: context.blockNumber,
        })
      : Promise.resolve(context.previousBalance),
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
          votes: context.previousPower,
        } satisfies CurrentVotesResult),
  ]);
  return { balance, power };
}

async function readTaskStateWithMulticall(
  options: ProcessOnchainRefreshBatchOptions,
  task: ClaimedTask,
  context: {
    previousBalance: bigint;
    previousPower: bigint;
    blockNumber: bigint;
  },
): Promise<{ balance: bigint; power: CurrentVotesResult }> {
  const client = createPublicClient({
    transport: http(options.rpcs[0]),
  });
  const contracts: any[] = [];
  const indexes: { balance?: number; power?: number } = {};
  if (task.refreshBalance) {
    indexes.balance = contracts.push({
      address: options.tokenAddress as `0x${string}`,
      abi: ABI_FUNCTION_BALANCE_OF,
      functionName: "balanceOf",
      args: [task.account as `0x${string}`],
    }) - 1;
  }
  if (task.refreshPower) {
    indexes.power = contracts.push({
      address: options.tokenAddress as `0x${string}`,
      abi: ABI_FUNCTION_GET_VOTES,
      functionName: "getVotes",
      args: [task.account as `0x${string}`],
    }) - 1;
  }

  const results = await (client as any).multicall({
    allowFailure: true,
    blockNumber: context.blockNumber,
    multicallAddress: options.multicallAddress as `0x${string}`,
    contracts,
  });

  const balanceResult =
    indexes.balance === undefined ? undefined : results[indexes.balance];
  const powerResult =
    indexes.power === undefined ? undefined : results[indexes.power];
  return {
    balance:
      balanceResult === undefined
        ? context.previousBalance
        : BigInt(readMulticallValue(balanceResult)),
    power:
      powerResult === undefined
        ? { method: "getVotes", votes: context.previousPower }
        : {
            method: "getVotes",
            votes: BigInt(readMulticallValue(powerResult)),
          },
  };
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

async function upsertContributor(
  dataSource: QueryableDataSource,
  options: ProcessOnchainRefreshBatchOptions,
  task: ClaimedTask,
  balance: bigint,
  power: bigint,
  blockNumber: bigint,
  blockTimestamp: bigint,
  previous: any,
) {
  await dataSource.query(
    `
      INSERT INTO contributor (
        id, chain_id, dao_code, governor_address, token_address, contract_address,
        block_number, block_timestamp, transaction_hash, power, balance,
        delegates_count_all, delegates_count_effective
      )
      VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, $12)
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
    [
      task.account,
      options.chainId,
      task.daoCode ?? options.daoCode ?? null,
      options.governorAddress,
      options.tokenAddress,
      blockNumber.toString(),
      blockTimestamp.toString(),
      "onchain-refresh",
      power.toString(),
      balance.toString(),
      Number(previous?.delegatesCountAll ?? 0),
      Number(previous?.delegatesCountEffective ?? 0),
    ],
  );
}

async function insertBalanceCheckpoint(
  dataSource: QueryableDataSource,
  options: ProcessOnchainRefreshBatchOptions,
  task: ClaimedTask,
  previousBalance: bigint,
  newBalance: bigint,
  blockNumber: bigint,
  blockTimestamp: bigint,
) {
  await dataSource.query(
    `
      INSERT INTO token_balance_checkpoint (
        id, chain_id, dao_code, governor_address, token_address, contract_address,
        account, previous_balance, new_balance, delta, source, cause,
        block_number, block_timestamp, transaction_hash
      )
      VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO NOTHING
    `,
    [
      `onchain-refresh-balance-${task.account}-${blockNumber.toString()}`,
      options.chainId,
      task.daoCode ?? options.daoCode ?? null,
      options.governorAddress,
      options.tokenAddress,
      task.account,
      previousBalance.toString(),
      newBalance.toString(),
      (newBalance - previousBalance).toString(),
      "balanceOf",
      "onchain-refresh",
      blockNumber.toString(),
      blockTimestamp.toString(),
      "onchain-refresh",
    ],
  );
}

async function insertPowerCheckpoint(
  dataSource: QueryableDataSource,
  options: ProcessOnchainRefreshBatchOptions,
  task: ClaimedTask,
  previousPower: bigint,
  result: CurrentVotesResult,
  blockNumber: bigint,
  blockTimestamp: bigint,
) {
  await dataSource.query(
    `
      INSERT INTO vote_power_checkpoint (
        id, chain_id, dao_code, governor_address, token_address, contract_address,
        account, clock_mode, timepoint, previous_power, new_power, delta, source, cause,
        block_number, block_timestamp, transaction_hash
      )
      VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (id) DO NOTHING
    `,
    [
      `onchain-refresh-power-${task.account}-${blockNumber.toString()}`,
      options.chainId,
      task.daoCode ?? options.daoCode ?? null,
      options.governorAddress,
      options.tokenAddress,
      task.account,
      "blocknumber",
      blockNumber.toString(),
      previousPower.toString(),
      result.votes.toString(),
      (result.votes - previousPower).toString(),
      result.method,
      "onchain-refresh",
      blockNumber.toString(),
      blockTimestamp.toString(),
      "onchain-refresh",
    ],
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
    return dataSource.transaction(callback);
  }
  await dataSource.query("BEGIN");
  try {
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
