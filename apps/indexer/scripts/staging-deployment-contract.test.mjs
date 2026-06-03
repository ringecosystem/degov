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
assert.deepEqual(contract.deploymentModel, {
  database: "one shared fresh Datalens indexer database",
  indexer: "one all-mode Datalens indexer workload",
  graphql: "one GraphQL service with scoped DAO routes",
  onchainRefreshWorker: "one shared worker workload",
});
assert.equal(contract.database.urlEnv, "DEGOV_INDEXER_DATABASE_URL");
assert.equal(contract.database.databaseName, "degov_datalens_migration_all_contract_sets");
assert.equal(contract.database.freshInitOnly, true);
assert.equal(contract.database.migration, "apps/indexer/migrations/0001_init.sql");
assert.equal(contract.configFile.env, "DEGOV_INDEXER_CONFIG_FILE");
assert.equal(contract.configFile.mountPath, "/app/indexer.yml");
assert.equal(contract.configFile.contractSetMode, "all");
assert.equal(contract.graphql.endpointEnv, "DEGOV_INDEXER_GRAPHQL_ENDPOINT");
assert.equal(contract.graphql.bindEndpoint, "http://0.0.0.0:4350/graphql");
assert.equal(contract.graphql.port, 4350);
assert.equal(contract.graphql.path, "/graphql");
assert.match(contract.graphql.routePolicy, /multiple scoped DAO hostnames/i);
assert.ok(
  contract.graphql.scopedRoutes.length >= 2,
  "staging contract must expose multiple scoped DAO routes",
);
for (const route of contract.graphql.scopedRoutes) {
  assert.ok(route.daoCode, "scoped route DAO code is required");
  assert.match(route.path, new RegExp(`^/${route.daoCode}/graphql$`));
  assert.match(route.publicEndpoint, new RegExp(`/${route.daoCode}/graphql$`));
}

assert.deepEqual(contract.runtimeEnv.DEGOV_INDEXER_CONFIG_FILE, contract.configFile.mountPath);
assert.equal(contract.runtimeEnv.DEGOV_INDEXER_CONTRACT_SET_MODE, "all");
assert.equal(contract.runtimeEnv.DEGOV_INDEXER_TARGET_HEIGHT, "latest");
assert.equal(contract.runtimeEnv.DEGOV_INDEXER_RUN_ONCE, "false");
assert.equal(contract.runtimeEnv.DATALENS_APPLICATION, contract.datalens.application);
assert.equal(contract.runtimeEnv.DATALENS_DATASET_FAMILY, contract.datalens.dataset.family);
assert.equal(contract.runtimeEnv.DATALENS_DATASET_NAME, contract.datalens.dataset.name);
assert.equal(contract.runtimeEnv.DATALENS_CHAINS_JSON, undefined);
assert.equal(contract.runtimeEnv.DATALENS_GOVERNOR_ADDRESS, undefined);
assert.equal(contract.runtimeEnv.DATALENS_GOVERNOR_TOKEN_ADDRESS, undefined);
assert.equal(contract.runtimeEnv.DATALENS_GOVERNOR_TOKEN_STANDARD, undefined);
assert.equal(contract.runtimeEnv.DATALENS_TIMELOCK_ADDRESS, undefined);
assert.equal(contract.runtimeEnv.DEGOV_INDEXER_DAO_CODE, undefined);

assert.ok(
  contract.contractSets.length >= 2,
  "staging contract must include multi-chain contract sets",
);

const daoCodes = new Set();
const chainIds = new Set();
for (const chain of contract.contractSets) {
  assert.ok(Number.isInteger(chain.chainId), "chain id is required");
  assert.ok(chain.networkName, "network name is required");
  chainIds.add(chain.chainId);
  assert.ok(
    chain.contracts.length >= 1,
    `${chain.networkName} must include at least one contract set`,
  );
  for (const configured of chain.contracts) {
    assert.ok(configured.daoCode, "contract set DAO code is required");
    assert.ok(!daoCodes.has(configured.daoCode), `duplicate DAO code ${configured.daoCode}`);
    daoCodes.add(configured.daoCode);
    assert.match(configured.governor, /^0x[0-9a-fA-F]{40}$/);
    assert.match(configured.governorToken, /^0x[0-9a-fA-F]{40}$/);
    assert.match(configured.tokenStandard, /^ERC(20|721)$/);
    assert.match(configured.timelock, /^0x[0-9a-fA-F]{40}$/);
    assert.ok(Number.isInteger(configured.startBlock));
  }
}
assert.ok(chainIds.size >= 2, "staging contract must cover multiple chains");
assert.deepEqual(
  new Set(contract.graphql.scopedRoutes.map((route) => route.daoCode)),
  daoCodes,
  "each configured contract set must have a scoped GraphQL route",
);
assert.equal(contract.daos, undefined);

assert.match(
  releaseYaml,
  /-\s+indexer\b/,
  "release workflow must publish the Datalens-native indexer image",
);

assert.deepEqual(contract.requiredRuntimeChecks, [
  "pod-readiness",
  "graphql-availability",
]);
assert.deepEqual(contract.onchainRefreshWorker.rpcChainUrlEnvs, [
  "DARWINIA_RPC_URL",
  "LISK_RPC_URL",
]);
assert.equal(
  contract.onchainRefreshWorker.env.DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED,
  "false",
);
assert.equal(contract.onchainRefreshWorker.env.DEGOV_ONCHAIN_REFRESH_RPC_URL, undefined);
assert.equal(
  contract.onchainRefreshWorker.env.DEGOV_ONCHAIN_REFRESH_CURRENT_POWER_METHOD,
  "getVotes",
);
assert.equal(
  contract.sharedSecretKeys.includes("DEGOV_ONCHAIN_REFRESH_RPC_URL"),
  false,
);
assert.equal(
  contract.sharedSecretKeys.includes("DARWINIA_RPC_URL"),
  true,
);
assert.equal(
  contract.sharedSecretKeys.includes("LISK_RPC_URL"),
  true,
);
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
