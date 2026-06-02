#!/usr/bin/env node

import {
  readDatalensStatus,
  summarizeStatusTables,
} from "./indexer-diagnostics.mjs";

export function parseArgs(argv) {
  const options = {
    databaseUrl: process.env.DEGOV_INDEXER_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    const [flag, inlineValue] = token.split("=", 2);
    const value = inlineValue ?? argv[index + 1];
    switch (flag) {
      case "--database-url":
        options.databaseUrl = value;
        if (inlineValue === undefined) {
          index += 1;
        }
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
  }
  return options;
}

export function buildHumanSummary(status) {
  return [
    "Datalens reconcile diagnostics",
    `checkpoint rows: ${status.checkpoints.length}`,
    `checkpoint stalls: ${status.checkpointStalls.length}`,
    `checkpoint errors: ${status.checkpointErrors.length}`,
    `reconcile backlog: ${JSON.stringify(status.reconcileBacklog)}`,
    `reconcile errors: ${status.reconcileErrors.length}`,
    `onchain refresh backlog: ${JSON.stringify(status.onchainRefreshBacklog)}`,
    `onchain refresh errors: ${status.onchainRefreshErrors.length}`,
    `legacy squid_processor.status: ${
      status.legacySquidStatus ? JSON.stringify(status.legacySquidStatus) : "not present"
    }`,
  ].join("\n");
}

export function usage() {
  return [
    "Usage: node apps/indexer/scripts/indexer-reconcile-diagnose.mjs --database-url <postgres-url> [--json]",
    "",
    "Reads Datalens-owned checkpoint, reconcile, and onchain refresh status tables.",
    "The script only runs SELECT statements. squid_processor.status is reported as a legacy bridge when present.",
  ].join("\n");
}

export async function diagnoseReconcile(options, services = {}) {
  if (!options.databaseUrl && !services.status) {
    throw new Error("--database-url or DEGOV_INDEXER_DATABASE_URL is required");
  }
  return services.status ?? readDatalensStatus(options.databaseUrl);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const status = await diagnoseReconcile(options);
  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  console.log(buildHumanSummary(status));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
