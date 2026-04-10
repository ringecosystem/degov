import {
  TypeormDatabase,
  type TypeormDatabaseOptions,
} from "@subsquid/typeorm-store";

export function getDatabaseOptions(): TypeormDatabaseOptions {
  return {
    supportHotBlocks: true,
    isolationLevel: "READ COMMITTED",
  };
}

export function createDatabase() {
  return new TypeormDatabase(getDatabaseOptions());
}
