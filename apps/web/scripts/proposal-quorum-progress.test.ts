import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("proposal total participation counts every vote bucket", () => {
  const progress = getProposalQuorumProgress({
    forVotes: 10n,
    againstVotes: 20n,
    abstainVotes: 5n,
    quorumRequired: 15n,
    countingMode: "support=bravo&quorum=for,abstain",
  });

  assert.equal(progress.totalVotesCast, 35n);
});

test("proposal quorum progress uses the compatibility fallback without a counting mode", () => {
  const progress = getProposalQuorumProgress({
    forVotes: 10n,
    againstVotes: 20n,
    abstainVotes: 5n,
    quorumRequired: 15n,
  });

  assert.equal(progress.currentVotes, 15n);
});

test("proposal quorum progress uses the compatibility fallback for a malformed counting mode", () => {
  const progress = getProposalQuorumProgress({
    forVotes: 10n,
    againstVotes: 20n,
    abstainVotes: 5n,
    quorumRequired: 15n,
    countingMode: "support=bravo&quorum=unknown",
  });

  assert.equal(progress.currentVotes, 15n);
});

test("proposal quorum progress rejects empty counting mode buckets", () => {
  const progress = getProposalQuorumProgress({
    forVotes: 10n,
    againstVotes: 20n,
    abstainVotes: 5n,
    quorumRequired: 15n,
    countingMode: "support=bravo&quorum=for,,against",
  });

  assert.equal(progress.currentVotes, 15n);
});

test("proposal quorum progress rejects duplicate counting mode buckets", () => {
  const progress = getProposalQuorumProgress({
    forVotes: 10n,
    againstVotes: 20n,
    abstainVotes: 5n,
    quorumRequired: 15n,
    countingMode: "support=bravo&quorum=for,for",
  });

  assert.equal(progress.currentVotes, 15n);
});

test("proposal vote summary distinguishes quorum progress from total participation", () => {
  const currentVotesSource = readFileSync(
    new URL("../src/app/proposal/[id]/current-votes.tsx", import.meta.url),
    "utf8"
  );
  const messages = JSON.parse(
    readFileSync(
      new URL("../messages/en/proposal-detail.json", import.meta.url),
      "utf8"
    )
  );

  assert.equal(
    messages.currentVotes.quorumProgress,
    "Quorum progress"
  );
  assert.equal(
    messages.currentVotes.totalParticipation,
    "Total participation"
  );
  assert.match(currentVotesSource, /t\("quorumProgress"\)/);
  assert.match(currentVotesSource, /t\("totalParticipation"\)/);
  assert.match(currentVotesSource, /formatTokenAmount\(totalVotesCast\)/);
});
