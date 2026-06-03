#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  TALLY_DELEGATES_QUERY,
  auditTarget,
  buildMarkdownReport,
  fetchTallyDelegates,
  fetchTallyProposals,
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

assert.match(TALLY_DELEGATES_QUERY, /tokenBalance/);
assert.match(TALLY_DELEGATES_QUERY, /balance/);

const fixturesDir = new URL("./fixtures/tally-onchain-e2e", import.meta.url)
  .pathname;
const replayProposals = await fetchTallyProposals(target, { fixturesDir });
const replayDelegates = await fetchTallyDelegates(target, { fixturesDir });
assert.equal(replayProposals[0].onchainId, "42");
assert.equal(replayDelegates[0].tokenBalance, "12");

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
      indexerStatus: {
        processedHeight: "123",
        targetHeight: "150",
        syncedPercentage: 82,
        isSynced: false,
      },
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
        state: "Defeated",
        votes: { for: "20", against: "1", abstain: "0" },
        quorum: "1000",
        startBlock: "11",
        endBlock: "21",
      },
      {
        onchainId: "44",
        title: "Tally-only proposal",
        state: "Active",
        votes: { for: "1", against: "0", abstain: "0" },
        quorum: "1000",
        startBlock: "12",
        endBlock: "22",
      },
    ],
    readProposalOnchain: async (_target, proposalId) => {
      if (proposalId === "43") {
        throw new Error("proposalSnapshot reverts");
      }
      return {
        state:
          proposalId === "42"
            ? "Executed"
            : proposalId === "44"
              ? "Active"
              : "Succeeded",
        proposalSnapshot:
          proposalId === "42" ? "10" : proposalId === "44" ? "12" : "11",
        proposalDeadline:
          proposalId === "42" ? "20" : proposalId === "44" ? "22" : "21",
        quorum: "1000",
      };
    },
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
        balance: "12",
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
      {
        address: "0x00000000000000000000000000000000000000dd",
        votes: "400",
        tokenBalance: "40",
        delegatorsCount: 4,
      },
    ],
    readDelegateOnchain: async (_target, address) => ({
      getVotes: address.endsWith("dd")
        ? "400"
        : address.endsWith("bb")
          ? "200"
          : address.endsWith("cc")
            ? "300"
            : "100",
      balanceOf: address.endsWith("dd")
        ? "40"
        : address.endsWith("bb")
          ? "25"
          : address.endsWith("cc")
            ? "30"
            : "12",
      getPastVotes: address.endsWith("cc") ? "250" : null,
      getPastVotesError: address.endsWith("aa")
        ? "getPastVotes execution reverted"
        : null,
    }),
  },
);

assert.equal(result.summary.proposals.sampled, 2);
assert.equal(result.summary.delegates.sampled, 3);
assert.equal(result.mismatches.length, 8);

assert.deepEqual(
  result.mismatches.map((entry) => [entry.scope, entry.field, entry.conclusion]),
  [
    ["proposal", "state", "tally-bug"],
    ["proposal", "quorum", "tally-bug"],
    ["proposal", "state", "chain-incompatibility"],
    ["proposal", "identity", "degov-bug"],
    ["delegate", "historicalVotingPower", "chain-incompatibility"],
    ["delegate", "votingPower", "tally-bug"],
    ["delegate", "historicalVotingPower", "expected-representation-difference"],
    ["delegate", "identity", "degov-bug"],
  ],
);

assert.equal(result.mismatches[0].dao, "ens-dao");
assert.equal(result.mismatches[0].degovValue, "Executed");
assert.equal(result.mismatches[0].tallyValue, "Active");
assert.equal(result.mismatches[0].onchainValue, "Executed");
assert.equal(result.mismatches[2].onchainError, "proposalSnapshot reverts");
assert.equal(result.mismatches[3].proposalId, "44");
assert.equal(result.mismatches[3].degovValue, null);
assert.equal(result.mismatches[3].tallyValue, "44");
assert.equal(result.mismatches[3].onchainValue, "44");
assert.equal(result.mismatches[4].address, "0x00000000000000000000000000000000000000aa");
assert.equal(result.mismatches[4].onchainValue, "unavailable");
assert.equal(result.mismatches[4].onchainError, "getPastVotes execution reverted");
assert.equal(result.mismatches[5].address, "0x00000000000000000000000000000000000000bb");
assert.equal(result.mismatches[5].degovValue, "200");
assert.equal(result.mismatches[5].tallyValue, "999");
assert.equal(result.mismatches[5].onchainValue, "200");
assert.equal(result.mismatches[6].degovValue, "not-represented");
assert.equal(result.mismatches[6].tallyValue, "not-represented");
assert.equal(result.mismatches[6].onchainValue, "250");
assert.equal(result.mismatches[7].address, "0x00000000000000000000000000000000000000dd");

const markdown = buildMarkdownReport({
  generatedAt: "2026-06-02T00:00:00.000Z",
  targets: [result],
  summary: {
    totalMismatches: result.mismatches.length,
    tallyBug: 3,
    degovBug: 2,
    chainIncompatibility: 2,
    expectedRepresentationDifference: 1,
    queryErrors: 0,
  },
});
assert.match(markdown, /Tally and Onchain E2E Validation/);
assert.match(markdown, /conclusion `tally-bug`/);
assert.match(markdown, /conclusion `chain-incompatibility`/);
assert.match(markdown, /conclusion `expected-representation-difference`/);

console.log("Indexer Tally onchain E2E tests passed");
