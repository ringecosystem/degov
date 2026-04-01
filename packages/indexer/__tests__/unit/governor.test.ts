import {
  calculateProposalVoteTimestamp,
  GovernorHandler,
} from "../../src/handler/governor";
import { ClockMode } from "../../src/internal/chaintool";
import { Proposal, TimelockCall, TimelockOperation } from "../../src/model";

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

describe("GovernorHandler canonical proposal metadata", () => {
  function createHandler(chainTool: Partial<any>) {
    return new GovernorHandler(
      {
        store: {
          findOne: jest.fn(async () => undefined),
          insert: jest.fn(async (entity) => entity),
          save: jest.fn(async (entity) => entity),
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
              address: "0x5555555555555555555555555555555555555555",
              standard: "erc20",
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

  function createProposalCreatedEventLog() {
    return {
      address: "0x9999999999999999999999999999999999999999",
      block: {
        height: 100,
        timestamp: 1_000,
      },
      id: "proposal-created-log",
      logIndex: 1,
      transactionHash: "0xdeadbeef",
      transactionIndex: 0,
    } as any;
  }

  function createProposalCreatedEvent() {
    return {
      description: "Test proposal",
      proposalId: 1n,
    } as any;
  }

  function createChainTool(options: {
    clockMode: ClockMode;
    exactStartTimestamp?: bigint;
    exactEndTimestamp?: bigint;
    blockInterval?: number;
  }) {
    const readContract = jest.fn(
      async ({ functionName }: { functionName: string }) => {
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
    );

    return {
      blockIntervalSeconds: jest.fn(async () => options.blockInterval ?? 12.5),
      clockMode: jest.fn(async () => options.clockMode),
      quorum: jest.fn(async () => ({
        clockMode: options.clockMode,
        quorum: 77n,
        decimals: 18n,
      })),
      readContract,
      readOptionalContract: jest.fn(async () => undefined),
      timepointToTimestampMs: jest
        .fn()
        .mockResolvedValueOnce(options.exactStartTimestamp)
        .mockResolvedValueOnce(options.exactEndTimestamp),
    };
  }

  it("persists chain-average blockInterval for timestamp governors", async () => {
    const chainTool = createChainTool({
      clockMode: ClockMode.Timestamp,
      exactStartTimestamp: 110_000n,
      exactEndTimestamp: 130_000n,
      blockInterval: 12.5,
    });
    const handler = createHandler(chainTool);

    const metadata = await (handler as any).loadCanonicalProposalMetadata(
      createProposalCreatedEventLog(),
      createProposalCreatedEvent(),
    );

    expect(metadata).toMatchObject({
      blockInterval: "12.5",
      clockMode: ClockMode.Timestamp,
      voteStartTimestamp: 110_000n,
      voteEndTimestamp: 130_000n,
    });
    expect(chainTool.blockIntervalSeconds).toHaveBeenCalledWith({
      chainId: 46,
      rpcs: ["https://rpc.example.invalid"],
      enableFloatValue: true,
    });
  });

  it("persists chain-average blockInterval for blocknumber governors even with exact timestamps", async () => {
    const chainTool = createChainTool({
      clockMode: ClockMode.BlockNumber,
      exactStartTimestamp: 126_000n,
      exactEndTimestamp: 376_000n,
      blockInterval: 12.5,
    });
    const handler = createHandler(chainTool);

    const metadata = await (handler as any).loadCanonicalProposalMetadata(
      createProposalCreatedEventLog(),
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

  it("uses the chain-average blockInterval for blocknumber fallback timestamps", async () => {
    const chainTool = createChainTool({
      clockMode: ClockMode.BlockNumber,
      exactStartTimestamp: undefined,
      exactEndTimestamp: undefined,
      blockInterval: 12.5,
    });
    const handler = createHandler(chainTool);

    const metadata = await (handler as any).loadCanonicalProposalMetadata(
      createProposalCreatedEventLog(),
      createProposalCreatedEvent(),
    );

    expect(metadata).toMatchObject({
      blockInterval: "12.5",
      voteStartTimestamp: 126_000n,
      voteEndTimestamp: 376_000n,
    });
    expect(chainTool.timepointToTimestampMs).toHaveBeenCalledTimes(2);
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
