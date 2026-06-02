#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  auditTarget,
  buildMarkdownReport,
  normalizeProposalId,
  parseArgs,
  selectSamples,
} from "./indexer-tally-onchain-e2e.mjs";

const target = {
  code: "ens-dao",
  name: "ENS",
  indexerEndpoint: "https://indexer.example/graphql",
  rpcUrl: "https://rpc.example",
  governor: "0x0000000000000000000000000000000000000002",
  governorToken: "0x0000000000000000000000000000000000000001",
  tallyGovernorId: "eip155:1:0x0000000000000000000000000000000000000002",
};

assert.equal(normalizeProposalId("0x2a"), "42");
assert.equal(normalizeProposalId("42"), "42");

assert.deepEqual(
  selectSamples(["a", "b", "c", "d", "e", "f"], {
    deterministicCount: 2,
    randomCount: 2,
    seed: "ens-dao",
  }),
  ["a", "b", "c", "d"],
);

assert.throws(
  () => parseArgs(["--targets-file"]),
  /--targets-file requires a value/,
);

const result = await auditTarget(
  target,
  {
    delegateLimit: 3,
    deterministicDelegates: 2,
    deterministicProposals: 2,
    proposalLimit: 4,
    randomDelegates: 1,
    randomProposals: 1,
    seed: "fixture",
  },
  {
    fetchDatalensSummary: async () => ({
      squidStatus: { height: "123", hash: "0xabc" },
      proposalsCount: 3,
      contributorsCount: 3,
      metrics: {
        powerSum: "600",
        memberCount: "3",
        chainId: 1,
        daoCode: "ens-dao",
      },
    }),
    fetchDatalensProposals: async () => [
      {
        proposalId: "0x2a",
        title: "Upgrade resolver",
        description: "# Upgrade resolver\n\nBody",
        proposalSnapshot: "10",
        proposalDeadline: "20",
        quorum: "1000",
        voteStartTimestamp: "100",
        voteEndTimestamp: "200",
        metricsVotesWeightForSum: "11",
        metricsVotesWeightAgainstSum: "2",
        metricsVotesWeightAbstainSum: "3",
        stateEpochs: [{ state: "Executed", startBlockNumber: "30" }],
      },
      {
        proposalId: "0x2b",
        title: "Treasury refill",
        description: "Treasury refill",
        proposalSnapshot: "11",
        proposalDeadline: "21",
        quorum: "1000",
        metricsVotesWeightForSum: "20",
        metricsVotesWeightAgainstSum: "1",
        metricsVotesWeightAbstainSum: "0",
        stateEpochs: [{ state: "Succeeded", startBlockNumber: "31" }],
      },
    ],
    fetchTallyProposals: async () => [
      {
        onchainId: "42",
        title: "Upgrade resolver",
        status: "active",
        voteStats: { for: "11", against: "2", abstain: "3" },
        quorum: "999",
        start: { number: "10" },
        end: { number: "20" },
      },
      {
        onchainId: "43",
        title: "Treasury refill",
        state: "Succeeded",
        votes: { for: "20", against: "1", abstain: "0" },
        quorum: "1000",
        startBlock: "11",
        endBlock: "21",
      },
    ],
    readProposalOnchain: async (_target, proposalId) => ({
      state: proposalId === "42" ? "Executed" : "Succeeded",
      proposalSnapshot: proposalId === "42" ? "10" : "11",
      proposalDeadline: proposalId === "42" ? "20" : "21",
      quorum: "1000",
    }),
    fetchDatalensDelegates: async () => [
      {
        id: "0x00000000000000000000000000000000000000aa",
        power: "100",
        balance: "12",
        delegatesCountAll: 2,
      },
      {
        id: "0x00000000000000000000000000000000000000bb",
        power: "200",
        balance: "25",
        delegatesCountAll: 1,
      },
      {
        id: "0x00000000000000000000000000000000000000cc",
        power: "300",
        balance: "30",
        delegatesCountAll: 0,
      },
    ],
    fetchTallyDelegates: async () => [
      {
        address: "0x00000000000000000000000000000000000000aa",
        votes: "100",
        tokenBalance: "12",
        delegatorsCount: 2,
      },
      {
        address: "0x00000000000000000000000000000000000000bb",
        votes: "999",
        tokenBalance: "25",
        delegatorsCount: 1,
      },
      {
        address: "0x00000000000000000000000000000000000000cc",
        votes: "300",
        tokenBalance: "30",
        delegatorsCount: 0,
      },
    ],
    readDelegateOnchain: async (_target, address) => ({
      getVotes: address.endsWith("bb") ? "200" : address.endsWith("cc") ? "300" : "100",
      balanceOf: address.endsWith("bb") ? "25" : address.endsWith("cc") ? "30" : "12",
      getPastVotes: address.endsWith("bb") ? "200" : address.endsWith("cc") ? "300" : "100",
    }),
  },
);

assert.equal(result.summary.proposals.sampled, 2);
assert.equal(result.summary.delegates.sampled, 3);
assert.equal(result.mismatches.length, 3);

assert.deepEqual(
  result.mismatches.map((entry) => [entry.scope, entry.field, entry.conclusion]),
  [
    ["proposal", "state", "tally-wrong"],
    ["proposal", "quorum", "tally-wrong"],
    ["delegate", "votingPower", "tally-wrong"],
  ],
);

assert.equal(result.mismatches[0].dao, "ens-dao");
assert.equal(result.mismatches[0].degovValue, "Executed");
assert.equal(result.mismatches[0].tallyValue, "Active");
assert.equal(result.mismatches[0].onchainValue, "Executed");
assert.equal(result.mismatches[2].address, "0x00000000000000000000000000000000000000bb");
assert.equal(result.mismatches[2].degovValue, "200");
assert.equal(result.mismatches[2].tallyValue, "999");
assert.equal(result.mismatches[2].onchainValue, "200");

const markdown = buildMarkdownReport({
  generatedAt: "2026-06-02T00:00:00.000Z",
  targets: [result],
  summary: {
    totalMismatches: result.mismatches.length,
    tallyWrong: 3,
    degovWrong: 0,
    inconclusive: 0,
  },
});
assert.match(markdown, /Tally and Onchain E2E Validation/);
assert.match(markdown, /conclusion `tally-wrong`/);

console.log("Indexer Tally onchain E2E tests passed");
