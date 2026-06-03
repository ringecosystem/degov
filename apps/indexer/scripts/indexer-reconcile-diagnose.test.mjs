#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  buildHumanSummary,
  diagnoseReconcile,
  parseArgs,
} from "./indexer-reconcile-diagnose.mjs";

assert.equal(
  parseArgs(["--database-url", "postgres://reader@example/db", "--json"]).json,
  true,
);

await assert.rejects(
  () => diagnoseReconcile({ databaseUrl: "" }),
  /--database-url/,
);

const status = {
  ...summarizeFixture(),
};

assert.equal(await diagnoseReconcile({ databaseUrl: "" }, { status }), status);
assert.match(buildHumanSummary(status), /checkpoint stalls: 1/);
assert.match(buildHumanSummary(status), /onchain refresh errors: 0/);

function summarizeFixture() {
  return {
    checkpoints: [{ daoCode: "ens-dao", streamId: "governance-events", syncPercent: 80 }],
    checkpointStalls: [{ daoCode: "ens-dao" }],
    checkpointErrors: [],
    reconcileBacklog: { pending: 1 },
    reconcileErrors: [],
    onchainRefreshBacklog: { pending: 2 },
    onchainRefreshErrors: [],
  };
}

console.log("Indexer reconcile diagnose tests passed");
