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
  legacySquidStatus: { height: "100", hash: null },
};

assert.equal(await diagnoseReconcile({ databaseUrl: "" }, { status }), status);
assert.match(buildHumanSummary(status), /checkpoint stalls: 1/);
assert.match(buildHumanSummary(status), /legacy squid_processor.status/);

function summarizeFixture() {
  return {
    checkpoints: [{ daoCode: "ens-dao" }],
    checkpointStalls: [{ daoCode: "ens-dao" }],
    checkpointErrors: [],
    reconcileBacklog: { pending: 1 },
    reconcileErrors: [],
    onchainRefreshBacklog: { pending: 2 },
    onchainRefreshErrors: [],
  };
}

console.log("Indexer reconcile diagnose tests passed");
