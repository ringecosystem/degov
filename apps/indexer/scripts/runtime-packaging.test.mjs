#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..", "..");

const [packageJson, composeYaml, envExample] = await Promise.all([
  readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  readFile(path.join(repositoryRoot, "docker-compose.yml"), "utf8"),
  readFile(path.join(repositoryRoot, ".env.example"), "utf8"),
]);

const packageConfig = JSON.parse(packageJson);

for (const scriptName of [
  "indexer",
  "indexer:migrate",
  "indexer:worker",
  "indexer:graphql",
]) {
  assert.equal(
    typeof packageConfig.scripts?.[scriptName],
    "string",
    `package.json must define ${scriptName}`,
  );
}

assert.match(packageConfig.scripts.indexer, /degov-datalens-indexer .*run/);
assert.match(packageConfig.scripts["indexer:worker"], /degov-datalens-indexer .*worker/);
assert.match(packageConfig.scripts["indexer:graphql"], /degov-datalens-indexer .*graphql/);
assert.match(packageConfig.scripts["indexer:migrate"], /degov-datalens-indexer .*migrate/);

function composeConfig(args = [], { envFile = true } = {}) {
  const composeArgs = ["compose"];
  if (envFile) {
    composeArgs.push("--env-file", ".env.example");
  }
  composeArgs.push(...args, "config", "--format", "json");

  const output = execFileSync(
    "docker",
    composeArgs,
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  return JSON.parse(output);
}

const defaultComposeWithoutEnvFile = composeConfig([], { envFile: false });
const defaultCompose = composeConfig();
const indexerCompose = composeConfig(["--profile", "indexer"]);
const defaultServicesWithoutEnvFile = defaultComposeWithoutEnvFile.services ?? {};
const defaultServices = defaultCompose.services ?? {};
const indexerServices = indexerCompose.services ?? {};

assert.match(composeYaml, /^\s+indexer:/m, "compose must define an indexer service");
assert.match(composeYaml, /^\s+onchain-worker:/m, "compose must define an onchain worker service");
assert.match(
  composeYaml,
  /^\s+indexer-graphql:/m,
  "compose must define a GraphQL service",
);
assert.match(
  composeYaml,
  /^\s+command: graphql/m,
  "compose GraphQL service must run the graphql entrypoint",
);
assert.match(
  composeYaml,
  /\$\{DEGOV_INDEXER_PORT:-4350\}:4350/,
  "compose GraphQL service must expose the GraphQL port",
);
assert.match(
  composeYaml,
  /DEGOV_INDEXER_GRAPHQL_ENDPOINT: \$\{DEGOV_INDEXER_GRAPHQL_BIND_ENDPOINT:-http:\/\/0\.0\.0\.0:4350\/graphql\}/,
  "compose GraphQL service must bind on the GraphQL path",
);
assert.equal(
  defaultServicesWithoutEnvFile.web?.depends_on?.["indexer-graphql"],
  undefined,
  "default web compose graph must render without an env file and must not depend on profile-gated indexer-graphql",
);
assert.equal(
  defaultServices.web?.depends_on?.["indexer-graphql"],
  undefined,
  "default web compose graph must not depend on profile-gated indexer-graphql",
);
assert.equal(
  defaultServices.web?.environment?.DEGOV_CONFIG_INDEXER_ENDPOINT,
  undefined,
  "default web compose graph must not override DAO config to local GraphQL",
);
assert.equal(
  defaultServices.web?.environment?.DEGOV_INDEXER_GRAPHQL_ENDPOINT,
  undefined,
  "default web compose graph must not expose a misleading unused GraphQL endpoint env",
);
assert.equal(
  indexerServices["indexer-graphql"]?.command?.[0],
  "graphql",
  "indexer profile must include the GraphQL service entrypoint",
);
assert.equal(
  indexerServices["web-local-indexer"]?.depends_on?.["indexer-graphql"]?.required,
  true,
  "indexer profile local web consumer must depend on local GraphQL",
);
assert.equal(
  indexerServices["web-local-indexer"]?.environment?.DEGOV_CONFIG_INDEXER_ENDPOINT,
  undefined,
  "local web DAO endpoint must be baked at build time, not passed as misleading runtime env",
);
assert.equal(
  indexerServices["web-local-indexer"]?.build?.args?.DEGOV_CONFIG_INDEXER_ENDPOINT,
  "http://indexer-graphql:4350/graphql",
  "indexer profile local web consumer must build DAO config for local GraphQL",
);
assert.match(composeYaml, /DATALENS_ENDPOINT/, "compose must pass Datalens environment");
assert.match(
  composeYaml,
  /DATALENS_CHAINS_JSON/,
  "compose must pass structured Datalens chain configuration",
);
assert.match(
  composeYaml,
  /DEGOV_INDEXER_DATABASE_URL/,
  "compose must pass the indexer database URL",
);
assert.doesNotMatch(
  composeYaml,
  /DEGOV_INDEXER_DB_NAME/,
  "compose must not expose an indexer DB override unless init creates the same DB",
);
assert.match(
  composeYaml,
  /DEGOV_INDEXER_DATABASE_URL: postgresql:\/\/postgres:\$\{DEGOV_DB_PASSWORD:-postgres\}@postgres\/indexer/,
  "compose must point the indexer at the DB created by postgres init",
);
assert.doesNotMatch(
  composeYaml,
  /\b(npx\s+sqd|sqd\s+serve|squid-processor|processor:start)\b/i,
  "compose must not start removed SQD processor commands",
);

assert.match(envExample, /DATALENS_ENDPOINT=/);
assert.match(envExample, /DATALENS_CHAINS_JSON=\[/);
assert.match(envExample, /DEGOV_INDEXER_DATABASE_URL=/);
assert.match(
  envExample,
  /DEGOV_INDEXER_GRAPHQL_ENDPOINT=http:\/\/127\.0\.0\.1:4350\/degov-demo-dao\/graphql/,
);
assert.match(envExample, /DEGOV_INDEXER_GRAPHQL_BIND_ADDRESS=0\.0\.0\.0:4350/);
assert.match(envExample, /DEGOV_INDEXER_GRAPHQL_PATH=\/degov-demo-dao\/graphql/);
assert.match(
  envExample,
  /DEGOV_INDEXER_GRAPHQL_INTERNAL_ENDPOINT=http:\/\/indexer-graphql:4350\/graphql/,
);
assert.match(
  envExample,
  /DEGOV_CONFIG_INDEXER_ENDPOINT=http:\/\/127\.0\.0\.1:4350\/degov-demo-dao\/graphql/,
);
assert.match(envExample, /DEGOV_WEB_INDEXER_PORT=3001/);
assert.match(envExample, /DEGOV_ONCHAIN_REFRESH_RPC_URL=/);
assert.match(envExample, /DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED=false/);
assert.doesNotMatch(
  envExample,
  /^DEGOV_INDEXER_DB_NAME=/m,
  ".env.example must not advertise an indexer DB override not honored by postgres init",
);
assert.doesNotMatch(
  envExample,
  /^DEGOV_INDEXER_GRAPHQL_ENDPOINT=https?:\/\/indexer\.next\.degov\.ai/m,
  ".env.example must not default local runtime packaging to the remote hosted indexer",
);

console.log("Runtime packaging check passed");
