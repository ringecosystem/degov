import assert from "node:assert/strict";
import test from "node:test";

import { GET_GOVERNANCE_COUNTS } from "../src/services/graphql/queries/counts.ts";
import {
  resolveGovernanceCounts,
  type GovernanceCountsResponse,
} from "../src/services/graphql/types/counts.ts";

test("governance counts query requests proposal and contributor totals", () => {
  assert.match(GET_GOVERNANCE_COUNTS, /proposalsConnection/);
  assert.match(GET_GOVERNANCE_COUNTS, /contributorsConnection/);
  assert.match(GET_GOVERNANCE_COUNTS, /totalCount/g);
});

test("governance counts fall back to zero when connection totals are missing", () => {
  assert.deepEqual(resolveGovernanceCounts(), {
    proposalsCount: 0,
    delegatesCount: 0,
  });
});

test("governance counts map proposal and delegate totals from connection responses", () => {
  const response: GovernanceCountsResponse = {
    proposalsConnection: {
      totalCount: 47,
    },
    contributorsConnection: {
      totalCount: 2516,
    },
  };

  assert.deepEqual(resolveGovernanceCounts(response), {
    proposalsCount: 47,
    delegatesCount: 2516,
  });
});
