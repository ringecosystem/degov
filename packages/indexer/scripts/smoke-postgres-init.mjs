#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

const schemaPath = path.resolve(import.meta.dirname, "..", "schema", "postgres.sql");
const databaseUrl = process.env.DEGOV_INDEXER_DATABASE_URL;

if (!databaseUrl) {
  console.error("DEGOV_INDEXER_DATABASE_URL must point to a clean Postgres database");
  process.exit(1);
}

const expectedTables = [
  "degov_indexer_checkpoint",
  "degov_indexer_reconcile_task",
  "proposal",
  "proposal_action",
  "proposal_state_epoch",
  "vote_cast_group",
  "vote_power_checkpoint",
  "token_balance_checkpoint",
  "onchain_refresh_task",
  "timelock_operation",
  "timelock_call",
  "timelock_role_event",
  "timelock_min_delay_change",
  "data_metric",
  "delegate_rolling",
  "delegate",
  "contributor",
  "delegate_mapping",
];

function runDockerPostgres(args, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "run",
        "--rm",
        "--network",
        "host",
        "-i",
        "postgres:17-alpine",
        ...args,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });

    if (stdin) {
      child.stdin.end(stdin);
    } else {
      child.stdin.end();
    }
  });
}

async function main() {
  const schema = await readFile(schemaPath, "utf8");
  const initResult = await runDockerPostgres(
    ["psql", databaseUrl, "--set", "ON_ERROR_STOP=1"],
    schema,
  );

  if (initResult.status !== 0) {
    console.error(initResult.stderr);
    process.exit(initResult.status ?? 1);
  }

  const verifySql = [
    "SELECT table_name",
    "FROM information_schema.tables",
    "WHERE table_schema = 'public'",
    `AND table_name = ANY (ARRAY[${expectedTables.map((name) => `'${name}'`).join(", ")}])`,
    "ORDER BY table_name;",
  ].join("\n");
  const verifyResult = await runDockerPostgres(
    ["psql", databaseUrl, "--tuples-only", "--no-align"],
    verifySql,
  );

  if (verifyResult.status !== 0) {
    console.error(verifyResult.stderr);
    process.exit(verifyResult.status ?? 1);
  }

  const foundTables = new Set(
    verifyResult.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const missingTables = expectedTables.filter((tableName) => !foundTables.has(tableName));

  if (missingTables.length > 0) {
    console.error(`Postgres schema smoke check missed tables: ${missingTables.join(", ")}`);
    process.exit(1);
  }

  console.log("Postgres initialization smoke check passed");
}

await main();
