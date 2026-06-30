import assert from "node:assert/strict";
import test from "node:test";

import { getProposalQuorumProgress } from "../src/app/proposal/[id]/current-votes-calculation.ts";

test("proposal quorum progress counts for against and abstain voting weight", () => {
  const progress = getProposalQuorumProgress({
    forVotes: 10n,
    againstVotes: 20n,
    abstainVotes: 5n,
    quorumRequired: 30n,
  });

  assert.equal(progress.currentVotes, 35n);
  assert.equal(progress.hasReachedQuorum, true);
});
