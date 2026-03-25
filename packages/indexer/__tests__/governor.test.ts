import {
  calculateProposalVoteTimestamp,
} from "../src/handler/governor";
import { ClockMode } from "../src/internal/chaintool";

describe("calculateProposalVoteTimestamp", () => {
  it("derives vote timestamps from block-based proposal timepoints", () => {
    expect(
      calculateProposalVoteTimestamp({
        clockMode: ClockMode.BlockNumber,
        proposalVoteStart: 110,
        proposalVoteEnd: 130,
        proposalCreatedBlock: 100,
        proposalStartTimestamp: 1_000,
        blockInterval: 12.5,
      }),
    ).toEqual({
      voteStart: 126_000,
      voteEnd: 376_000,
    });
  });

  it("uses proposal timepoints directly for timestamp-based governors", () => {
    expect(
      calculateProposalVoteTimestamp({
        clockMode: ClockMode.Timestamp,
        proposalVoteStart: 1_700_000_000,
        proposalVoteEnd: 1_700_086_400,
        proposalCreatedBlock: 0,
        proposalStartTimestamp: 0,
        blockInterval: 0,
      }),
    ).toEqual({
      voteStart: 1_700_000_000_000,
      voteEnd: 1_700_086_400_000,
    });
  });
});
