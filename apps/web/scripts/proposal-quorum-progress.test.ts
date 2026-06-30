import assert from "node:assert/strict";
import test from "node:test";

import { getProposalQuorumProgress } from "../src/app/proposal/[id]/current-votes-calculation.ts";

test("proposal quorum progress follows for and abstain quorum counting mode", () => {
  const progress = getProposalQuorumProgress({
    forVotes: 10n,
    againstVotes: 20n,
    abstainVotes: 5n,
    quorumRequired: 15n,
    countingMode: "support=bravo&quorum=for,abstain",
  });

  assert.equal(progress.currentVotes, 15n);
  assert.equal(progress.hasReachedQuorum, true);
});

test("proposal quorum progress counts against votes only when counting mode includes them", () => {
  const progress = getProposalQuorumProgress({
    forVotes: 10n,
    againstVotes: 20n,
    abstainVotes: 5n,
    quorumRequired: 30n,
    countingMode: "support=bravo&quorum=for,against,abstain",
  });

  assert.equal(progress.currentVotes, 35n);
  assert.equal(progress.hasReachedQuorum, true);
});
