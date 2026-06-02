#!/usr/bin/env node

import assert from "node:assert/strict";
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

assert.match(composeYaml, /^\s+indexer:/m, "compose must define an indexer service");
assert.match(composeYaml, /^\s+onchain-worker:/m, "compose must define an onchain worker service");
assert.match(composeYaml, /DATALENS_ENDPOINT/, "compose must pass Datalens environment");
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
assert.match(envExample, /DEGOV_INDEXER_DATABASE_URL=/);
assert.match(envExample, /DEGOV_INDEXER_GRAPHQL_ENDPOINT=/);
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
