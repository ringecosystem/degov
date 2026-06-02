#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  auditTarget,
  buildMarkdownReport,
  parseArgs,
  runAudit,
} from "./indexer-accuracy-audit.mjs";

const target = {
  code: "ens-dao",
  name: "ENS",
  indexerEndpoint: "https://indexer.example/graphql",
  rpcUrl: "https://rpc.example",
  governorToken: "0x0000000000000000000000000000000000000001",
  governor: "0x0000000000000000000000000000000000000002",
};

assert.match(
  parseArgs([
    "--limit",
    "50",
    "--negative-limit=25",
    "--concurrency",
    "2",
    "--database-url",
    "postgres://reader@example/db",
    "--fail-on-anomalies",
  ]).databaseUrl,
  /^postgres:\/\/reader/,
);

const targetResult = await auditTarget(
  target,
  { limit: 3, negativeLimit: 2, concurrency: 2 },
  {
    fetchTopContributors: async () => [
      { id: "0x1", power: "100", balance: "50" },
      { id: "0x2", power: "200", balance: "20" },
    ],
    fetchNegativeRows: async () => ({
      contributors: [{ id: "0xdead", power: "-1" }],
      delegates: [
        {
          id: "0xaaa_0xbbb",
          fromDelegate: "0xaaa",
          toDelegate: "0xbbb",
          power: "-2",
        },
      ],
    }),
    readCurrentVotes: async (_target, address) => ({
      source: "token.getVotes",
      value: address === "0x1" ? "100" : "120",
    }),
    readTokenBalance: async () => "50",
  },
);

assert.equal(targetResult.checkedAccounts, 2);
assert.equal(targetResult.matches, 1);
assert.equal(targetResult.mismatches[0].hint, "onchain-power-indexed-higher");
assert.equal(targetResult.negativeContributors.length, 1);
assert.equal(targetResult.negativeDelegates.length, 1);
assert.equal(targetResult.anomalyCount, 3);

const report = await runAudit([target], { limit: 1, negativeLimit: 1, concurrency: 1 }, {
  fetchTopContributors: async () => [{ id: "0x1", power: "10", balance: "10" }],
  fetchNegativeRows: async () => ({ contributors: [], delegates: [] }),
  readCurrentVotes: async () => ({ source: "token.getVotes", value: "10" }),
  readTokenBalance: async () => "10",
  status: {
    checkpointStalls: [{ daoCode: "ens-dao", streamId: "governance-events" }],
    onchainRefreshBacklog: { pending: 2 },
  },
});

assert.equal(report.summary.checkedAccounts, 1);
assert.equal(report.summary.checkpointStalls, 1);
assert.equal(report.summary.onchainRefreshBacklog, 2);
assert.match(buildMarkdownReport(report, [target]), /Datalens Indexer Accuracy Audit/);

console.log("Indexer accuracy audit tests passed");
