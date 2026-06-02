#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  diagnoseAddress,
  parseArgs,
} from "./indexer-accuracy-diagnose.mjs";

assert.throws(() => parseArgs(["--address"]), /--address requires a value/);
assert.throws(
  () => parseArgs(["--targets-file", "--json"]),
  /--targets-file requires a value/,
);

const options = parseArgs([
  "--address",
  "0x983110309620d911731ac0932219af06091b6744",
  "--code",
  "ens-dao",
  "--mapping-limit",
  "25",
  "--json",
]);

assert.equal(options.address, "0x983110309620d911731ac0932219af06091b6744");
assert.equal(options.code, "ens-dao");
assert.equal(options.mappingLimit, 25);
assert.equal(options.json, true);

const report = await diagnoseAddress(
  {
    ...options,
    databaseUrl: "",
    negativeLimit: 5,
  },
  {
    target: {
      code: "ens-dao",
      name: "ENS",
      indexerEndpoint: "https://indexer.example/graphql",
      rpcUrl: "https://rpc.example",
      governorToken: "0x0000000000000000000000000000000000000001",
    },
    graphqlRequest: async () => ({
      contributors: [{ id: options.address, power: "100", balance: "10" }],
      delegateMappings: [
        { id: "0x1_0x2", from: "0x1", to: options.address, power: "100" },
      ],
      delegates: [
        {
          id: "0x1_0x2",
          fromDelegate: "0x1",
          toDelegate: options.address,
          power: "-1",
        },
      ],
    }),
    readCurrentVotes: async () => ({ source: "token.getVotes", value: "80" }),
    readTokenBalance: async () => "10",
    status: {
      checkpointStalls: [],
      onchainRefreshBacklog: { pending: 1 },
    },
  },
);

assert.equal(report.contributorDelta, "20");
assert.equal(report.projectionClassification, "onchain-power-indexed-higher");
assert.equal(report.incomingMappings.length, 1);
assert.equal(report.negativeDelegates.length, 1);
assert.deepEqual(report.status.onchainRefreshBacklog, { pending: 1 });

const historicalReadReport = await diagnoseAddress(
  {
    ...options,
    databaseUrl: "",
  },
  {
    target: {
      code: "ens-dao",
      name: "ENS",
      indexerEndpoint: "https://indexer.example/graphql",
      rpcUrl: "https://rpc.example",
      governorToken: "0x0000000000000000000000000000000000000001",
    },
    graphqlRequest: async () => ({
      contributors: [
        { id: options.address, power: "100", balance: "10", blockNumber: "100" },
      ],
      delegateMappings: [],
      delegates: [],
    }),
    readCurrentVotes: async (target) => ({
      source: "token.getVotes",
      value: target.comparisonBlockHeight === "100" ? "100" : "80",
    }),
    readTokenBalance: async () => "10",
    status: {
      checkpoints: [
        {
          daoCode: "ens-dao",
          streamId: "governance-events",
          processedHeight: "100",
          targetHeight: "150",
        },
      ],
      checkpointStalls: [],
      onchainRefreshBacklog: {},
    },
  },
);

assert.equal(historicalReadReport.projectionClassification, null);

const queryErrorReport = await diagnoseAddress(
  {
    ...options,
    databaseUrl: "",
  },
  {
    target: {
      indexerEndpoint: "https://indexer.example/graphql",
      rpcUrl: "https://rpc.example",
      governorToken: "0x0000000000000000000000000000000000000001",
    },
    graphqlRequest: async () => {
      throw new Error("Datalens native query failed");
    },
    status: {
      checkpointStalls: [],
      onchainRefreshBacklog: {},
    },
  },
);

assert.equal(queryErrorReport.queryError.classification, "datalens-query-error");

console.log("Indexer accuracy diagnose tests passed");
