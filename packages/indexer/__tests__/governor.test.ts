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
