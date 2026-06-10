import assert from "node:assert/strict";
import test from "node:test";

import { GET_PROPOSAL_METRICS } from "../src/services/graphql/queries/proposals.ts";

test("proposal metrics query requests explicit contributor and holder counts", () => {
  assert.match(GET_PROPOSAL_METRICS, /contributorCount/);
  assert.match(GET_PROPOSAL_METRICS, /holdersCount/);
  assert.match(GET_PROPOSAL_METRICS, /memberCount/);
});
