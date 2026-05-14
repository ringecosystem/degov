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
  submit?: <T>(tx: unknown) => Promise<T>;
};

type SleepFn = (ms: number) => Promise<unknown>;

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
    target.submit = <TResult>(tx: unknown) =>
      retrySerializationFailure(
        "database transaction",
        () => submit<TResult>(tx),
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
