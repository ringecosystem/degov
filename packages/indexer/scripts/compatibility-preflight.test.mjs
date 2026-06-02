#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  validateDaoCompatibility,
} from "./compatibility-preflight.mjs";

function testRejectsErc20RegistryEntryWithErc721TransferShape() {
  const result = validateDaoCompatibility({
    dao: {
      code: "public-nouns-style-dao",
      governor: "0x0000000000000000000000000000000000000001",
      token: {
        contract: "0x0000000000000000000000000000000000000002",
        standard: "ERC20",
      },
    },
    probes: {
      governor: {
        methods: {
          hashProposal: "ok",
          proposalDeadline: "ok",
          proposalSnapshot: "ok",
          proposalVotes: "ok",
          quorum: "ok",
          state: "ok",
          votingDelay: "ok",
          votingPeriod: "ok",
        },
        events: [
          "ProposalCanceled",
          "ProposalCreated",
          "ProposalExecuted",
          "ProposalQueued",
          "VoteCast",
        ],
      },
      token: {
        transferIndexedArgCount: 3,
        methods: {
          balanceOf: "ok",
          delegates: "ok",
          getPastVotes: "ok",
          getVotes: "ok",
          name: "ok",
          symbol: "ok",
          totalSupply: "ok",
        },
        events: ["DelegateChanged", "DelegateVotesChanged", "Transfer"],
      },
    },
  });

  assert.equal(result.support, "unsupported");
  assert.match(
    result.errors.join("\n"),
    /declares ERC20 but Transfer has 3 indexed arguments/,
  );
}

function testRejectsGovernorSnapshotRevert() {
  const result = validateDaoCompatibility({
    dao: {
      code: "ring-protocol-dao",
      governor: "0x0000000000000000000000000000000000000003",
      token: {
        contract: "0x0000000000000000000000000000000000000004",
        standard: "ERC20",
      },
    },
    probes: {
      governor: {
        methods: {
          hashProposal: "ok",
          proposalDeadline: "ok",
          proposalSnapshot: "reverts",
          proposalVotes: "ok",
          quorum: "ok",
          state: "ok",
          votingDelay: "ok",
          votingPeriod: "ok",
        },
        events: [
          "ProposalCanceled",
          "ProposalCreated",
          "ProposalExecuted",
          "ProposalQueued",
          "VoteCast",
        ],
      },
      token: {
        transferIndexedArgCount: 2,
        methods: {
          balanceOf: "ok",
          delegates: "ok",
          getPastVotes: "ok",
          getVotes: "ok",
          name: "ok",
          symbol: "ok",
          totalSupply: "ok",
        },
        events: ["DelegateChanged", "DelegateVotesChanged", "Transfer"],
      },
    },
  });

  assert.equal(result.support, "unsupported");
  assert.match(result.errors.join("\n"), /proposalSnapshot reverts/);
}

function testAcceptsSupportedFallbacksAsDegraded() {
  const result = validateDaoCompatibility({
    dao: {
      code: "legacy-comp-style-dao",
      governor: "0x0000000000000000000000000000000000000005",
      token: {
        contract: "0x0000000000000000000000000000000000000006",
        standard: "ERC20",
      },
    },
    probes: {
      governor: {
        methods: {
          CLOCK_MODE: "missing",
          hashProposal: "ok",
          proposalDeadline: "ok",
          proposalSnapshot: "ok",
          proposalVotes: "ok",
          quorum: "ok",
          state: "ok",
          timelock: "missing",
          votingDelay: "ok",
          votingPeriod: "ok",
        },
        events: ["ProposalCreated", "ProposalExecuted", "VoteCast"],
      },
      token: {
        transferIndexedArgCount: 2,
        methods: {
          balanceOf: "ok",
          delegates: "ok",
          getCurrentVotes: "ok",
          getPriorVotes: "ok",
          getPastVotes: "missing",
          getVotes: "missing",
          name: "ok",
          symbol: "ok",
          totalSupply: "ok",
        },
        events: ["DelegateChanged", "DelegateVotesChanged", "Transfer"],
      },
    },
  });

  assert.equal(result.support, "degraded");
  assert.match(result.warnings.join("\n"), /CLOCK_MODE missing/);
  assert.match(result.warnings.join("\n"), /timelock missing/);
  assert.equal(result.voteReads.current, "getCurrentVotes");
  assert.equal(result.voteReads.historical, "getPriorVotes");
}

testRejectsErc20RegistryEntryWithErc721TransferShape();
testRejectsGovernorSnapshotRevert();
testAcceptsSupportedFallbacksAsDegraded();

console.log("Compatibility preflight tests passed");
