import assert from "node:assert/strict";
import test from "node:test";

import {
  getProposalMissingState,
  PROPOSAL_INDEXING_PROBLEM_MS,
} from "../src/app/proposal/[id]/proposal-indexing-state.ts";

test("missing proposal waits while the chain existence check is pending", () => {
  assert.equal(
    getProposalMissingState({
      chainExists: false,
      chainCheckPending: true,
      chainCheckError: null,
      missingObservedAt: 1000,
      now: 2000,
    }),
    "checking"
  );
});

test("missing proposal shows indexing while the chain has it and the threshold has not elapsed", () => {
  assert.equal(
    getProposalMissingState({
      chainExists: true,
      chainCheckPending: false,
      chainCheckError: null,
      missingObservedAt: 1000,
      now: 1000 + PROPOSAL_INDEXING_PROBLEM_MS - 1,
    }),
    "indexing"
  );
});

test("missing proposal shows a problem when the chain has it past the threshold", () => {
  assert.equal(
    getProposalMissingState({
      chainExists: true,
      chainCheckPending: false,
      chainCheckError: null,
      missingObservedAt: 1000,
      now: 1000 + PROPOSAL_INDEXING_PROBLEM_MS,
    }),
    "problem"
  );
});

test("missing proposal shows not found after the chain check rejects it", () => {
  assert.equal(
    getProposalMissingState({
      chainExists: false,
      chainCheckPending: false,
      chainCheckError: new Error("GovernorNonexistentProposal"),
      missingObservedAt: 1000,
      now: 2000,
    }),
    "not-found"
  );
});

test("missing proposal keeps checking when the chain check fails for another reason", () => {
  assert.equal(
    getProposalMissingState({
      chainExists: false,
      chainCheckPending: false,
      chainCheckError: new Error("HTTP request failed"),
      missingObservedAt: 1000,
      now: 2000,
    }),
    "checking"
  );
});
