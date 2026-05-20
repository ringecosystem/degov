import {
  TypeormDatabase,
  type TypeormDatabaseOptions,
} from "@subsquid/typeorm-store";
import { setTimeout } from "timers/promises";
import {
  isPostgresSerializationFailure,
  serializationRetryDelayMs,
} from "./internal/retry";

export function getDatabaseOptions(): TypeormDatabaseOptions {
  return {
    supportHotBlocks: parseBooleanEnv(
      process.env.DEGOV_INDEXER_HOT_BLOCKS_ENABLED,
      false,
    ),
  };
}

export function createDatabase() {
  return wrapSerializationRetry(new TypeormDatabase(getDatabaseOptions()));
}

type RetriableDatabase = {
  connect: () => Promise<unknown>;
  submit?: <T>(tx: (transaction: unknown) => Promise<T>) => Promise<T>;
};

type QueryableTransaction = {
  query?: (sql: string, parameters?: unknown[]) => Promise<unknown>;
};

type SleepFn = (ms: number) => Promise<unknown>;

const indexerWriteLockKey = "degov_indexer_write_transaction";

export async function acquireIndexerWriteTransactionLock(
  transaction: QueryableTransaction | undefined,
): Promise<void> {
  if (typeof transaction?.query !== "function") {
    return;
  }

  await transaction.query(
    "SELECT pg_advisory_xact_lock(hashtext(current_database()), hashtext($1))",
    [indexerWriteLockKey],
  );
}

export function wrapSerializationRetry<T extends object>(
  database: T,
  sleep: SleepFn = setTimeout,
): T {
  const target = database as unknown as RetriableDatabase;
  const connect = target.connect.bind(database);
  target.connect = () =>
    retrySerializationFailure("database connect", connect, sleep);

  if (target.submit) {
    const submit = target.submit.bind(database);
    target.submit = <TResult>(tx: (transaction: unknown) => Promise<TResult>) =>
      retrySerializationFailure(
        "database transaction",
        () =>
          submit<TResult>(async (transaction: unknown) => {
            await acquireIndexerWriteTransactionLock(
              transaction as QueryableTransaction,
            );
            return tx(transaction);
          }),
        sleep,
      );
  }

  return database;
}

async function retrySerializationFailure<T>(
  operation: string,
  callback: () => Promise<T>,
  sleep: SleepFn,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await callback();
    } catch (error) {
      if (!isPostgresSerializationFailure(error)) {
        throw error;
      }

      attempt += 1;
      const delayMs = serializationRetryDelayMs(attempt);
      console.warn(
        `postgres serialization failure during ${operation}; retrying attempt=${attempt} delayMs=${delayMs}`,
      );
      await sleep(delayMs);
    }
  }
}

function parseBooleanEnv(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined || value === "") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(
    `DEGOV_INDEXER_HOT_BLOCKS_ENABLED must be a boolean. Received: ${value}`,
  );
}
