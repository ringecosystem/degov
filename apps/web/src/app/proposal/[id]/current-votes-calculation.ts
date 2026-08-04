interface ProposalQuorumProgressInput {
  againstVotes: bigint;
  forVotes: bigint;
  abstainVotes: bigint;
  quorumRequired: bigint;
  countingMode?: string | null;
}

const parseQuorumBuckets = (countingMode?: string | null) => {
  const fallbackBuckets = ["for", "abstain"];
  const quorumConfig = countingMode
    ?.split("&")
    .find((part) => part.startsWith("quorum="));

  if (!quorumConfig) {
    return fallbackBuckets;
  }

  const quorumBuckets = quorumConfig
    .slice("quorum=".length)
    .split(",")
    .map((bucket) => bucket.trim().toLowerCase());

  if (
    new Set(quorumBuckets).size !== quorumBuckets.length ||
    quorumBuckets.some(
      (bucket) =>
        bucket.length === 0 ||
        !["for", "against", "abstain"].includes(bucket)
    )
  ) {
    return fallbackBuckets;
  }

  return quorumBuckets;
};

export const getProposalQuorumProgress = ({
  againstVotes,
  forVotes,
  abstainVotes,
  quorumRequired,
  countingMode,
}: ProposalQuorumProgressInput) => {
  const totalVotesCast = againstVotes + forVotes + abstainVotes;
  const quorumBuckets = parseQuorumBuckets(countingMode);
  const currentVotes = quorumBuckets.reduce((total, bucket) => {
    if (bucket === "for") return total + forVotes;
    if (bucket === "against") return total + againstVotes;
    if (bucket === "abstain") return total + abstainVotes;
    return total;
  }, 0n);
  const hasReachedQuorum =
    quorumRequired === 0n ? false : currentVotes >= quorumRequired;

  return { currentVotes, hasReachedQuorum, totalVotesCast };
};
