interface ProposalQuorumProgressInput {
  againstVotes: bigint;
  forVotes: bigint;
  abstainVotes: bigint;
  quorumRequired: bigint;
}

export const getProposalQuorumProgress = ({
  againstVotes,
  forVotes,
  abstainVotes,
  quorumRequired,
}: ProposalQuorumProgressInput) => {
  const currentVotes = againstVotes + forVotes + abstainVotes;
  const hasReachedQuorum =
    quorumRequired === 0n ? false : currentVotes >= quorumRequired;

  return { currentVotes, hasReachedQuorum };
};
