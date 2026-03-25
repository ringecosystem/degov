import {
  classifyVotePowerCheckpointCause,
  TokenHandler,
  votePowerTimepointForLog,
} from "../src/handler/token";
import { ChainTool, ClockMode } from "../src/internal/chaintool";
import {
  DelegateRolling,
  DelegateVotesChanged,
  TokenTransfer,
  VotePowerCheckpoint,
} from "../src/model";

describe("token vote power checkpoints", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses proposal-compatible block timepoints for blocknumber mode", () => {
    expect(
      votePowerTimepointForLog({
        clockMode: ClockMode.BlockNumber,
        blockHeight: 123,
        blockTimestampMs: 1_700_000_000_000,
      })
    ).toBe(123n);
  });

  it("uses proposal-compatible timestamp timepoints for timestamp mode", () => {
    expect(
      votePowerTimepointForLog({
        clockMode: ClockMode.Timestamp,
        blockHeight: 123,
        blockTimestampMs: 1_700_000_123_987,
      })
    ).toBe(1_700_000_123n);
  });

  it("classifies checkpoint causes from sibling token/governance events", () => {
    expect(
      classifyVotePowerCheckpointCause({
        hasDelegateChange: true,
        hasTransfer: true,
      })
    ).toBe("delegate-change+transfer");
    expect(
      classifyVotePowerCheckpointCause({
        hasDelegateChange: true,
        hasTransfer: false,
      })
    ).toBe("delegate-change");
    expect(
      classifyVotePowerCheckpointCause({
        hasDelegateChange: false,
        hasTransfer: true,
      })
    ).toBe("transfer");
    expect(
      classifyVotePowerCheckpointCause({
        hasDelegateChange: false,
        hasTransfer: false,
      })
    ).toBe("delegate-votes-changed");
  });

  it("materializes vote power checkpoints from delegate vote changes", async () => {
    const inserted: unknown[] = [];
    const store = {
      findOne: jest.fn(async (entity, options: any) => {
        if (entity === DelegateRolling) {
          return new DelegateRolling({
            id: "rolling",
            delegator: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
            fromDelegate: "0x0000000000000000000000000000000000000000",
            toDelegate: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
            transactionHash: options.where.transactionHash,
          });
        }
        if (entity === TokenTransfer) {
          return new TokenTransfer({
            id: "transfer",
            transactionHash: options.where.transactionHash,
          });
        }
        return undefined;
      }),
      insert: jest.fn(async (entity) => {
        inserted.push(entity);
      }),
    };

    const handler = new TokenHandler(
      {
        store,
        log: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
      } as any,
      {
        chainId: 1,
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
          name: "governorToken",
          address: "0x8888888888888888888888888888888888888888",
          standard: "ERC20",
        },
        chainTool: new ChainTool(),
      }
    );

    jest
      .spyOn(handler as any, "voteClockMode")
      .mockResolvedValue(ClockMode.BlockNumber);

    const delegateVotesChanged = new DelegateVotesChanged({
      id: "log-1",
      chainId: 1,
      daoCode: "demo",
      governorAddress: "0x9999999999999999999999999999999999999999",
      tokenAddress: "0x8888888888888888888888888888888888888888",
      contractAddress: "0x8888888888888888888888888888888888888888",
      logIndex: 7,
      transactionIndex: 3,
      delegate: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
      previousVotes: 12n,
      newVotes: 42n,
      blockNumber: 123n,
      blockTimestamp: 1_700_000_000_000n,
      transactionHash: "0xdeadbeef",
    });

    const eventLog = {
      id: "log-1",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 7,
      transactionIndex: 3,
      block: {
        height: 123,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: "0xdeadbeef",
    } as any;

    await (handler as any).storeVotePowerCheckpoint(delegateVotesChanged, eventLog);

    expect(store.insert).toHaveBeenCalledTimes(1);
    expect(inserted[0]).toBeInstanceOf(VotePowerCheckpoint);
    expect(inserted[0]).toMatchObject({
      id: "log-1",
      account: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      clockMode: ClockMode.BlockNumber,
      timepoint: 123n,
      previousPower: 12n,
      newPower: 42n,
      delta: 30n,
      cause: "delegate-change+transfer",
      delegator: "0xcccccccccccccccccccccccccccccccccccccccc",
      fromDelegate: "0x0000000000000000000000000000000000000000",
      toDelegate: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      blockNumber: 123n,
      transactionHash: "0xdeadbeef",
    });
  });
});
