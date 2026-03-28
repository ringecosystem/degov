import {
  calculateProposalVoteTimestamp,
  GovernorHandler,
} from "../src/handler/governor";
import { ClockMode } from "../src/internal/chaintool";
import { Proposal, TimelockCall, TimelockOperation } from "../src/model";

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

describe("GovernorHandler timelock queue materialization", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("links queued proposals to a timelock operation and calls", async () => {
    const saved: unknown[] = [];
    const store = {
      findOne: jest.fn(async () => undefined),
      save: jest.fn(async (entity) => {
        saved.push(entity);
        return entity;
      }),
    };

    const handler = new GovernorHandler(
      {
        store,
        log: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
      } as any,
      {
        chainId: 46,
        rpcs: ["https://rpc.example.invalid"],
        work: {
          daoCode: "demo",
          contracts: [
            {
              name: "governor",
              address: "0x9999999999999999999999999999999999999999",
            },
            {
              name: "timeLock",
              address: "0x7777777777777777777777777777777777777777",
            },
          ],
        },
        indexContract: {
          name: "governor",
          address: "0x9999999999999999999999999999999999999999",
        },
        chainTool: new (class {} as any)(),
        textPlus: new (class {} as any)(),
      }
    );

    const proposal = new Proposal({
      id: "proposal-log",
      chainId: 46,
      daoCode: "demo",
      governorAddress: "0x9999999999999999999999999999999999999999",
      proposalId: "0x1",
      descriptionHash:
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      targets: [
        "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
      ],
      values: ["1", "2"],
      calldatas: ["0x1234", "0xabcd"],
      timelockAddress: "0x7777777777777777777777777777777777777777",
      clockMode: ClockMode.BlockNumber,
    });

    await (handler as any).syncTimelockOperationForProposalQueue(
      proposal,
      {
        id: "queue-log",
        logIndex: 3,
        transactionIndex: 2,
        block: {
          height: 100,
          timestamp: 900_000,
        },
        transactionHash: "0xdeadbeef",
      },
      1_000n
    );

    expect(store.save).toHaveBeenCalledTimes(3);
    expect(saved[0]).toBeInstanceOf(TimelockOperation);
    expect(saved[1]).toBeInstanceOf(TimelockCall);
    expect(saved[2]).toBeInstanceOf(TimelockCall);
    expect(saved[0]).toMatchObject({
      proposalId: "0x1",
      timelockType: "GovernorTimelockControl",
      state: "Waiting",
      callCount: 2,
      executedCallCount: 0,
      delaySeconds: 100n,
      readyAt: 1_000_000n,
      queuedTransactionHash: "0xdeadbeef",
    });
    expect(saved[1]).toMatchObject({
      proposalId: "0x1",
      proposalActionIndex: 0,
      proposalActionId: "proposal-log:action:0",
      actionIndex: 0,
      target: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
      value: "1",
      data: "0x1234",
      state: "Waiting",
    });
    expect(saved[2]).toMatchObject({
      proposalId: "0x1",
      proposalActionIndex: 1,
      proposalActionId: "proposal-log:action:1",
      actionIndex: 1,
      target: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
      value: "2",
      data: "0xabcd",
      state: "Waiting",
    });
  });
});

describe("GovernorHandler canonical proposal metadata", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createHandler(chainTool: Record<string, jest.Mock>) {
    return new GovernorHandler(
      {
        store: {
          findOne: jest.fn(),
          save: jest.fn(),
          insert: jest.fn(),
        },
        log: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
      } as any,
      {
        chainId: 46,
        rpcs: ["https://rpc.example.invalid"],
        work: {
          daoCode: "demo",
          contracts: [
            {
              name: "governor",
              address: "0x9999999999999999999999999999999999999999",
            },
            {
              name: "governorToken",
              address: "0x8888888888888888888888888888888888888888",
              standard: "ERC20",
            },
          ],
        },
        indexContract: {
          name: "governor",
          address: "0x9999999999999999999999999999999999999999",
        },
        chainTool: chainTool as any,
        textPlus: new (class {} as any)(),
      },
    );
  }

  function createProposalCreatedLog() {
    return {
      id: "proposal-created-log",
      block: {
        height: 100,
        timestamp: 1_000,
      },
      transactionHash: "0xdeadbeef",
    } as any;
  }

  function createProposalCreatedEvent() {
    return {
      proposalId: 0x1n,
      description: "Proposal body",
    } as any;
  }

  it("persists a chain-average blockInterval for timestamp governors", async () => {
    const chainTool = {
      blockIntervalSeconds: jest.fn(async () => 12.5),
      clockMode: jest.fn(async () => ClockMode.Timestamp),
      quorum: jest.fn(async () => ({
        clockMode: ClockMode.Timestamp,
        quorum: 77n,
        decimals: 18n,
      })),
      readContract: jest.fn(
        async ({
          functionName,
        }: {
          functionName: string;
        }) => {
          switch (functionName) {
            case "proposalSnapshot":
              return 1_700_000_000n;
            case "proposalDeadline":
              return 1_700_086_400n;
            case "COUNTING_MODE":
              return "support=bravo";
            default:
              throw new Error(`Unexpected functionName: ${functionName}`);
          }
        },
      ),
      readOptionalContract: jest.fn(async () => undefined),
      timepointToTimestampMs: jest.fn(async ({ timepoint }: { timepoint: bigint }) =>
        timepoint * 1000n,
      ),
    };
    const handler = createHandler(chainTool);

    const metadata = await (handler as any).loadCanonicalProposalMetadata(
      createProposalCreatedLog(),
      createProposalCreatedEvent(),
    );

    expect(metadata).toMatchObject({
      blockInterval: "12.5",
      clockMode: ClockMode.Timestamp,
      countingMode: "support=bravo",
      decimals: 18n,
      proposalDeadline: 1_700_086_400n,
      proposalSnapshot: 1_700_000_000n,
      quorum: 77n,
      voteEndTimestamp: 1_700_086_400_000n,
      voteStartTimestamp: 1_700_000_000_000n,
    });
    expect(chainTool.blockIntervalSeconds).toHaveBeenCalledTimes(1);
  });

  it("derives blockInterval from exact block timestamps when available", async () => {
    const chainTool = {
      blockIntervalSeconds: jest.fn(),
      clockMode: jest.fn(async () => ClockMode.BlockNumber),
      quorum: jest.fn(async () => ({
        clockMode: ClockMode.BlockNumber,
        quorum: 55n,
        decimals: 18n,
      })),
      readContract: jest.fn(
        async ({
          functionName,
        }: {
          functionName: string;
        }) => {
          switch (functionName) {
            case "proposalSnapshot":
              return 110n;
            case "proposalDeadline":
              return 130n;
            case "COUNTING_MODE":
              return "support=bravo";
            default:
              throw new Error(`Unexpected functionName: ${functionName}`);
          }
        },
      ),
      readOptionalContract: jest.fn(async () => undefined),
      timepointToTimestampMs: jest.fn(
        async ({ timepoint }: { timepoint: bigint }) => {
          if (timepoint === 110n) {
            return 126_000n;
          }
          if (timepoint === 130n) {
            return 376_000n;
          }
          throw new Error(`Unexpected timepoint: ${timepoint.toString()}`);
        },
      ),
    };
    const handler = createHandler(chainTool);

    const metadata = await (handler as any).loadCanonicalProposalMetadata(
      createProposalCreatedLog(),
      createProposalCreatedEvent(),
    );

    expect(metadata).toMatchObject({
      blockInterval: "12.5",
      clockMode: ClockMode.BlockNumber,
      voteStartTimestamp: 126_000n,
      voteEndTimestamp: 376_000n,
    });
    expect(chainTool.blockIntervalSeconds).not.toHaveBeenCalled();
  });

  it("falls back to chain-average blockInterval when block timestamps are unresolved", async () => {
    const chainTool = {
      blockIntervalSeconds: jest.fn(async () => 12.5),
      clockMode: jest.fn(async () => ClockMode.BlockNumber),
      quorum: jest.fn(async () => ({
        clockMode: ClockMode.BlockNumber,
        quorum: 55n,
        decimals: 18n,
      })),
      readContract: jest.fn(
        async ({
          functionName,
        }: {
          functionName: string;
        }) => {
          switch (functionName) {
            case "proposalSnapshot":
              return 110n;
            case "proposalDeadline":
              return 130n;
            case "COUNTING_MODE":
              return "support=bravo";
            default:
              throw new Error(`Unexpected functionName: ${functionName}`);
          }
        },
      ),
      readOptionalContract: jest.fn(async () => undefined),
      timepointToTimestampMs: jest.fn(async () => undefined),
    };
    const handler = createHandler(chainTool);

    const metadata = await (handler as any).loadCanonicalProposalMetadata(
      createProposalCreatedLog(),
      createProposalCreatedEvent(),
    );

    expect(metadata).toMatchObject({
      blockInterval: "12.5",
      clockMode: ClockMode.BlockNumber,
      voteStartTimestamp: 126_000n,
      voteEndTimestamp: 376_000n,
    });
    expect(chainTool.blockIntervalSeconds).toHaveBeenCalledTimes(1);
  });
});
