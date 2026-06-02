#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..", "..");

const [contractJson, releaseYaml, runbookMarkdown] = await Promise.all([
  readFile(
    path.join(repositoryRoot, "deploy/staging/datalens-indexer-daos.json"),
    "utf8",
  ),
  readFile(path.join(repositoryRoot, ".github/workflows/release.yml"), "utf8"),
  readFile(
    path.join(repositoryRoot, "docs/runbook/datalens-staging-deployment.md"),
    "utf8",
  ),
]);

const contract = JSON.parse(contractJson);

assert.equal(contract.environment, "staging");
assert.equal(contract.image.repository, "ghcr.io/ringecosystem/degov/indexer");
assert.equal(contract.image.tagTemplate, "sha-<git-sha>");
assert.deepEqual(contract.entrypoints, {
  migrate: ["migrate"],
  indexer: ["run"],
  graphql: ["graphql"],
  onchainRefreshWorker: ["worker"],
});
assert.equal(contract.onchainRefreshWorker.enabled, false);
assert.match(
  contract.onchainRefreshWorker.enableWhen,
  /checkpoint\/status integration/i,
);
assert.equal(contract.datalens.endpointEnv, "DATALENS_ENDPOINT");
assert.equal(contract.datalens.tokenEnv, "DATALENS_TOKEN");
assert.equal(contract.datalens.applicationEnv, "DATALENS_APPLICATION");
assert.equal(contract.datalens.application, "degov-staging");
assert.equal(contract.datalens.dataset.family, "evm");
assert.equal(contract.datalens.dataset.name, "logs");

assert.ok(contract.daos.length >= 1, "staging contract must include selected DAOs");

const daoCodes = new Set();
const databaseNames = new Set();
for (const dao of contract.daos) {
  assert.ok(dao.code, "DAO code is required");
  assert.ok(!daoCodes.has(dao.code), `duplicate DAO code ${dao.code}`);
  daoCodes.add(dao.code);

  assert.match(
    dao.databaseName,
    /^degov_datalens_migration_[a-z0-9_]+$/,
    `${dao.code} must use a fresh Datalens migration DB name`,
  );
  assert.ok(
    !databaseNames.has(dao.databaseName),
    `duplicate database name ${dao.databaseName}`,
  );
  databaseNames.add(dao.databaseName);

  assert.equal(dao.env.DATALENS_APPLICATION, contract.datalens.application);
  assert.equal(dao.env.DEGOV_INDEXER_DAO_CODE, dao.code);
  assert.equal(dao.env.DEGOV_INDEXER_START_BLOCK, dao.startBlock);
  assert.equal(dao.env.DEGOV_INDEXER_TARGET_HEIGHT, dao.targetHeight);
  assert.ok(
    dao.env.DEGOV_INDEXER_TARGET_HEIGHT >= dao.env.DEGOV_INDEXER_START_BLOCK,
  );
  assert.equal(dao.env.DATALENS_DATASET_FAMILY, contract.datalens.dataset.family);
  assert.equal(dao.env.DATALENS_DATASET_NAME, contract.datalens.dataset.name);
  assert.equal(dao.env.DATALENS_QUERY_ROW_LIMIT, undefined);
  assert.equal(dao.env.DATALENS_CHAIN_FAMILY, "evm");
  assert.ok(dao.env.DATALENS_CHAIN_NAME);
  assert.ok(Number.isInteger(dao.env.DATALENS_CHAIN_ID));
  assert.match(dao.env.DATALENS_GOVERNOR_ADDRESS, /^0x[0-9a-fA-F]{40}$/);
  assert.match(dao.env.DATALENS_GOVERNOR_TOKEN_ADDRESS, /^0x[0-9a-fA-F]{40}$/);
  assert.match(dao.env.DATALENS_GOVERNOR_TOKEN_STANDARD, /^ERC(20|721)$/);
  if (dao.env.DATALENS_TIMELOCK_ADDRESS) {
    assert.match(dao.env.DATALENS_TIMELOCK_ADDRESS, /^0x[0-9a-fA-F]{40}$/);
  }
}

assert.match(
  releaseYaml,
  /-\s+indexer\b/,
  "release workflow must publish the Datalens-native indexer image",
);

assert.deepEqual(contract.requiredRuntimeChecks, [
  "pod-readiness",
  "graphql-availability",
]);
assert.deepEqual(contract.futureRuntimeChecks, [
  "db-checkpoint-progress",
  "worker-task-status",
  "page-sync-percentage",
]);
assert.doesNotMatch(
  runbookMarkdown,
  /pnpm run audit:tally-onchain --[\s\S]*?--database-url/,
  "Tally/onchain audit does not accept --database-url",
);

console.log("Staging deployment contract check passed");
