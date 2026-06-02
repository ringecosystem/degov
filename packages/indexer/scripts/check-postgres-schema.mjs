#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const schemaPath = path.join(root, "schema", "postgres.sql");
const readmePath = path.join(root, "README.md");
const docsReadmePath = path.resolve(root, "..", "..", "docs", "README.md");

const requiredTables = [
  "degov_indexer_checkpoint",
  "degov_indexer_reconcile_task",
  "delegate_changed",
  "delegate_votes_changed",
  "token_transfer",
  "vote_power_checkpoint",
  "token_balance_checkpoint",
  "onchain_refresh_task",
  "proposal_canceled",
  "proposal_created",
  "proposal_executed",
  "proposal_queued",
  "proposal_extended",
  "voting_delay_set",
  "voting_period_set",
  "proposal_threshold_set",
  "quorum_numerator_updated",
  "late_quorum_vote_extension_set",
  "timelock_change",
  "vote_cast",
  "vote_cast_with_params",
  "vote_cast_group",
  "proposal",
  "proposal_action",
  "proposal_state_epoch",
  "governance_parameter_checkpoint",
  "proposal_deadline_extension",
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

const requiredSchemaSnippets = [
  /Datalens-native DeGov indexer PostgreSQL schema/i,
  /fresh index initialization/i,
  /reset or recreate/i,
  /No historical in-place migration/i,
  /NUMERIC\(78,\s*0\)/i,
  /CREATE TABLE IF NOT EXISTS degov_indexer_checkpoint/i,
  /CREATE TABLE IF NOT EXISTS degov_indexer_reconcile_task/i,
  /UNIQUE NULLS NOT DISTINCT/i,
  /CREATE INDEX IF NOT EXISTS/i,
];

const requiredReadmeSnippets = [
  /schema\/postgres\.sql/,
  /canonical PostgreSQL schema/i,
  /reset or recreate/i,
  /fresh initialization/i,
  /reference\/schema\.graphql/,
  /GraphQL/i,
  /sqlx/i,
];

function tablePattern(tableName) {
  return new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${tableName}\\b`, "i");
}

async function main() {
  const [schema, readme, docsReadme] = await Promise.all([
    readFile(schemaPath, "utf8"),
    readFile(readmePath, "utf8"),
    readFile(docsReadmePath, "utf8"),
  ]);

  for (const pattern of requiredSchemaSnippets) {
    assert.match(schema, pattern, `schema must include ${pattern}`);
  }

  for (const tableName of requiredTables) {
    assert.match(schema, tablePattern(tableName), `schema must create ${tableName}`);
  }

  for (const pattern of requiredReadmeSnippets) {
    assert.match(readme, pattern, `indexer README must include ${pattern}`);
  }

  assert.match(
    docsReadme,
    /Datalens PostgreSQL schema/i,
    "docs README must route readers to the Datalens PostgreSQL schema owner",
  );

  console.log("Postgres schema ownership check passed");
}

await main();
