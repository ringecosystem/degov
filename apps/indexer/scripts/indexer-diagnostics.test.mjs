#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  classifyDatalensQueryError,
  classifyProjectionMismatch,
  summarizeCheckpointRows,
  summarizeStatusTables,
} from "./indexer-diagnostics.mjs";

assert.equal(
  classifyDatalensQueryError(new Error("Datalens native query failed")),
  "datalens-query-error",
);
assert.equal(
  classifyDatalensQueryError(new Error("cannot parse uint256 ABI payload")),
  "decode-error",
);
assert.equal(
  classifyDatalensQueryError(new Error('column "power" does not exist')),
  "projection-mismatch",
);
assert.equal(
  classifyDatalensQueryError(new Error("RPC timeout")),
  "transport-error",
);

assert.equal(
  classifyProjectionMismatch({
    indexed: "10",
    chain: "8",
    source: "onchain-power",
  }),
  "onchain-power-indexed-higher",
);
assert.equal(
  classifyProjectionMismatch({
    indexed: "8",
    chain: "10",
    source: "onchain-power",
  }),
  "onchain-power-indexed-lower",
);
assert.equal(
  classifyProjectionMismatch({
    indexed: "10",
    chain: "10",
    source: "onchain-power",
  }),
  null,
);

const checkpointRows = summarizeCheckpointRows(
  [
    {
      dao_code: "ens-dao",
      chain_id: 1,
      stream_id: "governance-events",
      data_source_version: "datalens-v1",
      next_block: "101",
      processed_height: "100",
      target_height: "150",
      updated_at: "2026-06-02T07:00:00.000Z",
      last_error: null,
    },
    {
      dao_code: "lisk-dao",
      chain_id: 1135,
      stream_id: "governance-events",
      data_source_version: "datalens-v1",
      next_block: "200",
      processed_height: "199",
      target_height: "200",
      updated_at: "2026-06-02T07:59:00.000Z",
      last_error: "column proposal_id does not exist",
    },
  ],
  {
    nowMs: Date.parse("2026-06-02T08:00:00.000Z"),
    stallMinutes: 15,
  },
);

assert.equal(checkpointRows[0].stalled, true);
assert.equal(checkpointRows[0].lagBlocks, "50");
assert.equal(checkpointRows[0].classification, "checkpoint-stall");
assert.equal(checkpointRows[1].classification, "projection-mismatch");

const status = summarizeStatusTables({
  checkpoints: [
    {
      dao_code: "ens-dao",
      chain_id: 1,
      stream_id: "governance-events",
      data_source_version: "datalens-v1",
      processed_height: "100",
      target_height: "101",
      updated_at: "2026-06-02T07:00:00.000Z",
    },
  ],
  reconcileTasks: [
    { id: "r1", status: "pending", attempts: 0 },
    { id: "r2", status: "failed", attempts: 3, error: "Datalens query failed" },
  ],
  refreshTasks: [
    { id: "p1", status: "pending", attempts: 0 },
    { id: "p2", status: "pending", attempts: 1 },
  ],
  legacyStatus: { height: "99", hash: null },
});

assert.deepEqual(status.reconcileBacklog, { pending: 1, failed: 1 });
assert.deepEqual(status.onchainRefreshBacklog, { pending: 2 });
assert.equal(status.reconcileErrors[0].classification, "datalens-query-error");
assert.deepEqual(status.legacySquidStatus, { height: "99", hash: null });

console.log("Indexer diagnostics tests passed");
