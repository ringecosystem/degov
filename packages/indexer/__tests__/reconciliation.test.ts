import { ClockMode } from "../src/internal/chaintool";
import {
  compareScalarField,
  deriveProjectedProposalState,
  governorStateName,
} from "../src/internal/reconciliation";

describe("reconciliation helpers", () => {
  it("maps governor state enum values to readable names", () => {
    expect(governorStateName(0)).toBe("Pending");
    expect(governorStateName(7n)).toBe("Executed");
    expect(governorStateName(99)).toBe("Unknown(99)");
  });

  it("marks pending and active states from proposal timepoints", () => {
    expect(
      deriveProjectedProposalState({
        clockMode: ClockMode.BlockNumber,
        proposalSnapshot: 100n,
        proposalDeadline: 120n,
        quorum: 10n,
        votesFor: 0n,
        votesAgainst: 0n,
        votesAbstain: 0n,
        currentTimepoint: 100n,
        currentTimestampMs: 0n,
        hasCanceledEvent: false,
        hasExecutedEvent: false,
        hasQueuedEvent: false,
      })
    ).toBe("Pending");

    expect(
      deriveProjectedProposalState({
        clockMode: ClockMode.BlockNumber,
        proposalSnapshot: 100n,
        proposalDeadline: 120n,
        quorum: 10n,
        votesFor: 0n,
        votesAgainst: 0n,
        votesAbstain: 0n,
        currentTimepoint: 115n,
        currentTimestampMs: 0n,
        hasCanceledEvent: false,
        hasExecutedEvent: false,
        hasQueuedEvent: false,
      })
    ).toBe("Active");
  });

  it("derives succeeded, defeated, queued, expired, canceled, and executed states", () => {
    const baseInput = {
      clockMode: ClockMode.Timestamp,
      proposalSnapshot: 100n,
      proposalDeadline: 120n,
      quorum: 10n,
      votesFor: 15n,
      votesAgainst: 2n,
      votesAbstain: 0n,
      currentTimepoint: 121n,
      currentTimestampMs: 200_000n,
      hasCanceledEvent: false,
      hasExecutedEvent: false,
      hasQueuedEvent: false,
    };

    expect(deriveProjectedProposalState(baseInput)).toBe("Succeeded");
    expect(
      deriveProjectedProposalState({
        ...baseInput,
        votesFor: 2n,
        votesAgainst: 15n,
      })
    ).toBe("Defeated");
    expect(
      deriveProjectedProposalState({
        ...baseInput,
        hasQueuedEvent: true,
        timelockAddress: "0x4444444444444444444444444444444444444444",
        queueReadyAt: 150_000n,
      })
    ).toBe("Queued");
    expect(
      deriveProjectedProposalState({
        ...baseInput,
        hasQueuedEvent: true,
        timelockAddress: "0x4444444444444444444444444444444444444444",
        queueExpiresAt: 150_000n,
      })
    ).toBe("Expired");
    expect(
      deriveProjectedProposalState({
        ...baseInput,
        hasCanceledEvent: true,
      })
    ).toBe("Canceled");
    expect(
      deriveProjectedProposalState({
        ...baseInput,
        hasExecutedEvent: true,
      })
    ).toBe("Executed");
  });

  it("compares scalar fields for report output", () => {
    expect(compareScalarField("quorum", "10", "10")).toEqual({
      field: "quorum",
      projected: "10",
      onChain: "10",
      matches: true,
      details: undefined,
    });
  });
});
