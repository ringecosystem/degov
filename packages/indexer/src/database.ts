import {
  TypeormDatabase,
  type IsolationLevel,
  type TypeormDatabaseOptions,
} from "@subsquid/typeorm-store";

export function getDatabaseOptions(): TypeormDatabaseOptions {
  const isolationLevel = getIsolationLevel();
  return {
    supportHotBlocks: true,
    ...(isolationLevel ? { isolationLevel } : {}),
  };
}

export function createDatabase() {
  return new TypeormDatabase(getDatabaseOptions());
}

function getIsolationLevel(): IsolationLevel | undefined {
  const value = process.env.DEGOV_INDEXER_DATABASE_ISOLATION_LEVEL;
  if (!value) {
    return undefined;
  }
  if (
    value === "SERIALIZABLE" ||
    value === "REPEATABLE READ" ||
    value === "READ COMMITTED"
  ) {
    return value;
  }
  throw new Error(
    `DEGOV_INDEXER_DATABASE_ISOLATION_LEVEL must be SERIALIZABLE, REPEATABLE READ, or READ COMMITTED. Received: ${value}`,
  );
}
