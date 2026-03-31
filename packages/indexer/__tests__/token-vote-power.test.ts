import {
  classifyVotePowerCheckpointCause,
  TokenHandler,
  votePowerTimepointForLog,
} from "../src/handler/token";
import * as itokenerc20 from "../src/abi/itokenerc20";
import * as itokenerc721 from "../src/abi/itokenerc721";
import { ChainTool, ClockMode } from "../src/internal/chaintool";
import { zeroAddress } from "viem";
import {
  Contributor,
  DataMetric,
  Delegate,
  DelegateMapping,
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

  it("clears undelegated mappings instead of attributing power to the zero address", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 100n,
      }),
      new Contributor({
        id: "0x1111111111111111111111111111111111111111",
        power: 100n,
        delegatesCountAll: 1,
        delegatesCountEffective: 1,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Delegate({
        id: "0x2222222222222222222222222222222222222222_0x1111111111111111111111111111111111111111",
        fromDelegate: "0x2222222222222222222222222222222222222222",
        toDelegate: "0x1111111111111111111111111111111111111111",
        isCurrent: true,
        power: 100n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new DelegateMapping({
        id: "0x2222222222222222222222222222222222222222",
        from: "0x2222222222222222222222222222222222222222",
        to: "0x1111111111111111111111111111111111111111",
        power: 100n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
    ]);

    const handler = buildTokenHandler(store);
    jest
      .spyOn(handler as any, "voteClockMode")
      .mockResolvedValue(ClockMode.BlockNumber);

    const undelegateLog = {
      id: "log-undelegate",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 1,
      transactionIndex: 1,
      block: {
        height: 10,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: "0xundelegate",
    } as any;

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValue({
        delegator: "0x2222222222222222222222222222222222222222",
        fromDelegate: "0x1111111111111111111111111111111111111111",
        toDelegate: "0x0000000000000000000000000000000000000000",
      } as any);

    await (handler as any).storeDelegateChanged(undelegateLog);

    expect(
      store.findEntity(DelegateMapping, "0x2222222222222222222222222222222222222222")
    ).toBeUndefined();
    expect(
      store.findEntity(Contributor, "0x0000000000000000000000000000000000000000")
    ).toBeUndefined();

    jest
      .spyOn(itokenerc20.events.DelegateVotesChanged, "decode")
      .mockReturnValue({
        delegate: "0x1111111111111111111111111111111111111111",
        previousVotes: 100n,
        newVotes: 0n,
      } as any);

    await (handler as any).storeDelegateVotesChanged({
      ...undelegateLog,
      id: "log-votes",
      logIndex: 2,
    });

    expect(
      store.findEntity(
        Delegate,
        "0x2222222222222222222222222222222222222222_0x1111111111111111111111111111111111111111"
      )
    ).toMatchObject({
      power: 0n,
      isCurrent: false,
    });
    expect(store.findEntity(DataMetric, "global")?.powerSum).toBe(0n);
    expect(
      store.findEntity(Contributor, "0x1111111111111111111111111111111111111111")
        ?.power
    ).toBe(0n);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValue({
      from: "0x2222222222222222222222222222222222222222",
      to: "0x3333333333333333333333333333333333333333",
      value: 50n,
    } as any);

    await (handler as any).storeTokenTransfer({
      ...undelegateLog,
      id: "log-transfer",
      logIndex: 3,
      transactionHash: "0xtransfer-after-undelegate",
    });

    expect(
      store.findEntity(
        Delegate,
        "0x2222222222222222222222222222222222222222_0x0000000000000000000000000000000000000000"
      )
    ).toBeUndefined();
    expect(
      store.findEntity(Contributor, "0x0000000000000000000000000000000000000000")
    ).toBeUndefined();
    expect(store.findEntity(DataMetric, "global")?.powerSum).toBe(0n);
  });

  it("preserves normal redelegation bookkeeping between non-zero delegates", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 100n,
      }),
      new Contributor({
        id: "0x1111111111111111111111111111111111111111",
        power: 100n,
        delegatesCountAll: 1,
        delegatesCountEffective: 1,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Delegate({
        id: "0x2222222222222222222222222222222222222222_0x1111111111111111111111111111111111111111",
        fromDelegate: "0x2222222222222222222222222222222222222222",
        toDelegate: "0x1111111111111111111111111111111111111111",
        isCurrent: true,
        power: 100n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new DelegateMapping({
        id: "0x2222222222222222222222222222222222222222",
        from: "0x2222222222222222222222222222222222222222",
        to: "0x1111111111111111111111111111111111111111",
        power: 100n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
    ]);

    const handler = buildTokenHandler(store);
    jest
      .spyOn(handler as any, "voteClockMode")
      .mockResolvedValue(ClockMode.BlockNumber);

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValue({
        delegator: "0x2222222222222222222222222222222222222222",
        fromDelegate: "0x1111111111111111111111111111111111111111",
        toDelegate: "0x3333333333333333333333333333333333333333",
      } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-redelegate",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 1,
      transactionIndex: 1,
      block: {
        height: 11,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: "0xredelegate",
    } as any);

    expect(
      store.findEntity(DelegateMapping, "0x2222222222222222222222222222222222222222")
    ).toMatchObject({
      from: "0x2222222222222222222222222222222222222222",
      to: "0x3333333333333333333333333333333333333333",
      power: 0n,
    });
    expect(
      store.findEntity(Contributor, "0x1111111111111111111111111111111111111111")
    ).toMatchObject({
      delegatesCountAll: 0,
      delegatesCountEffective: 1,
      power: 100n,
    });
    expect(
      store.findEntity(Contributor, "0x3333333333333333333333333333333333333333")
    ).toMatchObject({
      delegatesCountAll: 1,
      delegatesCountEffective: 0,
      power: 0n,
    });

    const delegateVotesChangedDecode = jest.spyOn(
      itokenerc20.events.DelegateVotesChanged,
      "decode"
    );
    delegateVotesChangedDecode
      .mockReturnValueOnce({
        delegate: "0x1111111111111111111111111111111111111111",
        previousVotes: 100n,
        newVotes: 0n,
      } as any)
      .mockReturnValueOnce({
        delegate: "0x3333333333333333333333333333333333333333",
        previousVotes: 0n,
        newVotes: 100n,
      } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "log-old-delegate-votes",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 2,
      transactionIndex: 1,
      block: {
        height: 11,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: "0xredelegate",
    } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "log-new-delegate-votes",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 3,
      transactionIndex: 1,
      block: {
        height: 11,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: "0xredelegate",
    } as any);

    expect(
      store.findEntity(
        Delegate,
        "0x2222222222222222222222222222222222222222_0x1111111111111111111111111111111111111111"
      )
    ).toMatchObject({
      power: 0n,
      isCurrent: false,
    });
    expect(
      store.findEntity(
        Delegate,
        "0x2222222222222222222222222222222222222222_0x3333333333333333333333333333333333333333"
      )
    ).toMatchObject({
      power: 100n,
      isCurrent: true,
    });
    expect(
      store.findEntity(Contributor, "0x1111111111111111111111111111111111111111")
    ).toMatchObject({
      delegatesCountAll: 0,
      delegatesCountEffective: 0,
      power: 0n,
    });
    expect(
      store.findEntity(Contributor, "0x3333333333333333333333333333333333333333")
    ).toMatchObject({
      delegatesCountAll: 1,
      delegatesCountEffective: 1,
      power: 100n,
    });
    expect(store.findEntity(DataMetric, "global")?.powerSum).toBe(100n);
    expect(
      store.findEntity(DataMetric, "0x3333333333333333333333333333333333333333")
    ).toBeUndefined();
    expect(
      store.findEntity(Contributor, "0x0000000000000000000000000000000000000000")
    ).toBeUndefined();
  });

  it("marks redelegated zero-power rows as historical while preserving the current relation", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 0n,
      }),
      new Contributor({
        id: "0x1111111111111111111111111111111111111111",
        power: 0n,
        delegatesCountAll: 1,
        delegatesCountEffective: 0,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Delegate({
        id: "0x2222222222222222222222222222222222222222_0x1111111111111111111111111111111111111111",
        fromDelegate: "0x2222222222222222222222222222222222222222",
        toDelegate: "0x1111111111111111111111111111111111111111",
        isCurrent: true,
        power: 0n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new DelegateMapping({
        id: "0x2222222222222222222222222222222222222222",
        from: "0x2222222222222222222222222222222222222222",
        to: "0x1111111111111111111111111111111111111111",
        power: 0n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
    ]);

    const handler = buildTokenHandler(store);

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValue({
        delegator: "0x2222222222222222222222222222222222222222",
        fromDelegate: "0x1111111111111111111111111111111111111111",
        toDelegate: "0x3333333333333333333333333333333333333333",
      } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-zero-redelegate",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 1,
      transactionIndex: 1,
      block: {
        height: 20,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: "0xzero-redelegate",
    } as any);

    expect(
      store.findEntity(
        Delegate,
        "0x2222222222222222222222222222222222222222_0x1111111111111111111111111111111111111111"
      )
    ).toMatchObject({
      power: 0n,
      isCurrent: false,
      transactionHash: "0xzero-redelegate",
    });
    expect(
      store.findEntity(
        Delegate,
        "0x2222222222222222222222222222222222222222_0x3333333333333333333333333333333333333333"
      )
    ).toMatchObject({
      power: 0n,
      isCurrent: true,
      transactionHash: "0xzero-redelegate",
    });
  });

  it("still materializes self-delegation from the undelegated state", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 0n,
      }),
    ]);

    const handler = buildTokenHandler(store);

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValue({
        delegator: "0x4444444444444444444444444444444444444444",
        fromDelegate: "0x0000000000000000000000000000000000000000",
        toDelegate: "0x4444444444444444444444444444444444444444",
      } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-self-delegate",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 1,
      transactionIndex: 1,
      block: {
        height: 12,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: "0xself-delegate",
    } as any);

    expect(
      store.findEntity(DelegateMapping, "0x4444444444444444444444444444444444444444")
    ).toMatchObject({
      from: "0x4444444444444444444444444444444444444444",
      to: "0x4444444444444444444444444444444444444444",
      power: 0n,
    });
    expect(
      store.findEntity(
        Delegate,
        "0x4444444444444444444444444444444444444444_0x4444444444444444444444444444444444444444"
      )
    ).toMatchObject({
      power: 0n,
    });
    expect(
      store.findEntity(Contributor, "0x4444444444444444444444444444444444444444")
    ).toMatchObject({
      power: 0n,
      delegatesCountAll: 1,
      delegatesCountEffective: 1,
    });
    expect(store.findEntity(DataMetric, "global")?.powerSum).toBe(0n);
    expect(
      store.findEntity(Contributor, "0x0000000000000000000000000000000000000000")
    ).toBeUndefined();
  });

  it("ignores noop delegate changes that keep the same effective delegate", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 307279092879868136263502n,
      }),
      new Contributor({
        id: "0xa6c177dcbd481a3138d858022b3f2fe184793778",
        power: 307279092879868136263502n,
        delegatesCountAll: 1,
        delegatesCountEffective: 1,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Delegate({
        id: "0x28db77e391e92eb5113ebbf3355d8ba0cbc6ebbd_0xa6c177dcbd481a3138d858022b3f2fe184793778",
        fromDelegate: "0x28db77e391e92eb5113ebbf3355d8ba0cbc6ebbd",
        toDelegate: "0xa6c177dcbd481a3138d858022b3f2fe184793778",
        isCurrent: true,
        power: 307279092879868136263502n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new DelegateMapping({
        id: "0x28db77e391e92eb5113ebbf3355d8ba0cbc6ebbd",
        from: "0x28db77e391e92eb5113ebbf3355d8ba0cbc6ebbd",
        to: "0xa6c177dcbd481a3138d858022b3f2fe184793778",
        power: 307279092879868136263502n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
    ]);

    const handler = buildTokenHandler(store);

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValue({
        delegator: "0x28db77e391e92eb5113ebbf3355d8ba0cbc6ebbd",
        fromDelegate: "0xa6c177dcbd481a3138d858022b3f2fe184793778",
        toDelegate: "0xa6c177dcbd481a3138d858022b3f2fe184793778",
      } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-noop-delegate",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 1,
      transactionIndex: 1,
      block: {
        height: 12,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: "0xnoop-delegate",
    } as any);

    expect(
      store.findEntity(DelegateMapping, "0x28db77e391e92eb5113ebbf3355d8ba0cbc6ebbd")
    ).toMatchObject({
      to: "0xa6c177dcbd481a3138d858022b3f2fe184793778",
      power: 307279092879868136263502n,
      transactionHash: "0xseed",
    });
    expect(
      store.findEntity(
        Delegate,
        "0x28db77e391e92eb5113ebbf3355d8ba0cbc6ebbd_0xa6c177dcbd481a3138d858022b3f2fe184793778"
      )
    ).toMatchObject({
      power: 307279092879868136263502n,
      isCurrent: true,
      transactionHash: "0xseed",
    });
    expect(
      store.findEntity(Contributor, "0xa6c177dcbd481a3138d858022b3f2fe184793778")
    ).toMatchObject({
      delegatesCountAll: 1,
      delegatesCountEffective: 1,
      power: 307279092879868136263502n,
    });
    expect(store.findEntity(DataMetric, "global")?.powerSum).toBe(
      307279092879868136263502n
    );
  });

  it("does not resurrect an undelegated mapping during batch flush", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 0n,
      }),
    ]);

    const handler = buildTokenHandler(store);
    jest
      .spyOn(handler as any, "voteClockMode")
      .mockResolvedValue(ClockMode.BlockNumber);

    const delegateChangedDecode = jest.spyOn(
      itokenerc20.events.DelegateChanged,
      "decode"
    );
    const delegateVotesChangedDecode = jest.spyOn(
      itokenerc20.events.DelegateVotesChanged,
      "decode"
    );

    delegateChangedDecode.mockReturnValueOnce({
      delegator: "0xd25f3ff4d63179800dce837dc5412dac1ba6133f",
      fromDelegate: "0x0000000000000000000000000000000000000000",
      toDelegate: "0xb9259aeedf68948647be301844174f5e249c2948",
    } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-initial-delegate",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 1,
      transactionIndex: 1,
      block: {
        height: 10,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: "0xinitial-delegate",
    } as any);

    delegateVotesChangedDecode.mockReturnValueOnce({
      delegate: "0xb9259aeedf68948647be301844174f5e249c2948",
      previousVotes: 0n,
      newVotes: 24162269903537182680n,
    } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "log-initial-votes",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 2,
      transactionIndex: 1,
      block: {
        height: 10,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: "0xinitial-delegate",
    } as any);

    delegateChangedDecode.mockReturnValueOnce({
      delegator: "0xd25f3ff4d63179800dce837dc5412dac1ba6133f",
      fromDelegate: "0xb9259aeedf68948647be301844174f5e249c2948",
      toDelegate: "0x0000000000000000000000000000000000000000",
    } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-undelegate",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 3,
      transactionIndex: 1,
      block: {
        height: 11,
        timestamp: 1_700_000_100_000,
      },
      transactionHash: "0xundelegate",
    } as any);

    delegateVotesChangedDecode.mockReturnValueOnce({
      delegate: "0xb9259aeedf68948647be301844174f5e249c2948",
      previousVotes: 24162269903537182680n,
      newVotes: 0n,
    } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "log-undelegate-votes",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 4,
      transactionIndex: 1,
      block: {
        height: 11,
        timestamp: 1_700_000_100_000,
      },
      transactionHash: "0xundelegate",
    } as any);

    await (handler as any).flush();

    expect(
      store.findEntity(DelegateMapping, "0xd25f3ff4d63179800dce837dc5412dac1ba6133f")
    ).toBeUndefined();
    expect(
      store.findEntity(
        Delegate,
        "0xd25f3ff4d63179800dce837dc5412dac1ba6133f_0xb9259aeedf68948647be301844174f5e249c2948"
      )
    ).toMatchObject({
      power: 0n,
      isCurrent: false,
    });
  });

  it("matches delegate vote changes even when delegate rolling uses checksum addresses", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 0n,
      }),
    ]);

    const handler = buildTokenHandler(store);
    jest
      .spyOn(handler as any, "voteClockMode")
      .mockResolvedValue(ClockMode.BlockNumber);

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValue({
        delegator: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        fromDelegate: "0x0000000000000000000000000000000000000000",
        toDelegate: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
      } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-checksum-delegate",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 1,
      transactionIndex: 1,
      block: {
        height: 12,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: "0xchecksum-delegate",
    } as any);

    jest
      .spyOn(itokenerc20.events.DelegateVotesChanged, "decode")
      .mockReturnValue({
        delegate: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        previousVotes: 0n,
        newVotes: 50n,
      } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "log-checksum-votes",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 2,
      transactionIndex: 1,
      block: {
        height: 12,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: "0xchecksum-delegate",
    } as any);

    expect(
      store.findEntity(
        Delegate,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      )
    ).toMatchObject({
      power: 50n,
      isCurrent: true,
      transactionHash: "0xchecksum-delegate",
    });
    expect(
      store.findEntity(DelegateMapping, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    ).toMatchObject({
      to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      power: 50n,
      transactionHash: "0xchecksum-delegate",
    });
    expect(
      store.findEntity(Contributor, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
    ).toMatchObject({
      power: 50n,
      delegatesCountAll: 1,
      delegatesCountEffective: 1,
      transactionHash: "0xchecksum-delegate",
    });
  });

  it("preserves in-batch delegate power when snapshots update the same relation before flush", async () => {
    class SnapshotBlindStore extends MemoryStore {
      override async findOne(
        entity: any,
        options: { where: Record<string, unknown> }
      ) {
        if (entity === Delegate && "id" in options.where) {
          return undefined;
        }
        return super.findOne(entity, options);
      }
    }

    const store = new SnapshotBlindStore([
      new DataMetric({
        id: "global",
        powerSum: 0n,
      }),
    ]);

    const handler = buildTokenHandler(store);

    await (handler as any).storeDelegate(
      new Delegate({
        chainId: 1,
        daoCode: "demo",
        governorAddress: "0x9999999999999999999999999999999999999999",
        tokenAddress: "0x8888888888888888888888888888888888888888",
        contractAddress: "0x8888888888888888888888888888888888888888",
        logIndex: 1,
        transactionIndex: 1,
        fromDelegate: "0x3a3ee61f7c6e1994a2001762250a5e17b2061b6d",
        toDelegate: "0x809fa673fe2ab515faa168259cb14e2bedebf68e",
        blockNumber: 22431465n,
        blockTimestamp: 1n,
        transactionHash: "0xpositive",
        power: 115702885900196237403783n,
      })
    );

    await (handler as any).upsertDelegateSnapshot({
      chainId: 1,
      daoCode: "demo",
      governorAddress: "0x9999999999999999999999999999999999999999",
      tokenAddress: "0x8888888888888888888888888888888888888888",
      contractAddress: "0x8888888888888888888888888888888888888888",
      logIndex: 2,
      transactionIndex: 2,
      fromDelegate: "0x3a3ee61f7c6e1994a2001762250a5e17b2061b6d",
      toDelegate: "0x809fa673fe2ab515faa168259cb14e2bedebf68e",
      blockNumber: 22434323n,
      blockTimestamp: 2n,
      transactionHash: "0xsnapshot",
      isCurrent: false,
    });

    await (handler as any).storeDelegate(
      new Delegate({
        chainId: 1,
        daoCode: "demo",
        governorAddress: "0x9999999999999999999999999999999999999999",
        tokenAddress: "0x8888888888888888888888888888888888888888",
        contractAddress: "0x8888888888888888888888888888888888888888",
        logIndex: 3,
        transactionIndex: 3,
        fromDelegate: "0x3a3ee61f7c6e1994a2001762250a5e17b2061b6d",
        toDelegate: "0x809fa673fe2ab515faa168259cb14e2bedebf68e",
        blockNumber: 22434323n,
        blockTimestamp: 2n,
        transactionHash: "0xnegative",
        power: -115702885900196237403783n,
      })
    );

    expect(
      store.findEntity(
        Delegate,
        "0x3a3ee61f7c6e1994a2001762250a5e17b2061b6d_0x809fa673fe2ab515faa168259cb14e2bedebf68e"
      )
    ).toMatchObject({
      power: 0n,
      isCurrent: false,
      transactionHash: "0xnegative",
    });
  });

  it("does not let a historical relation overwrite the current delegate mapping power", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 50n,
      }),
      new Contributor({
        id: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        power: 50n,
        delegatesCountAll: 1,
        delegatesCountEffective: 1,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Contributor({
        id: "0xcccccccccccccccccccccccccccccccccccccccc",
        power: 20n,
        delegatesCountAll: 0,
        delegatesCountEffective: 1,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Delegate({
        id: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_0xcccccccccccccccccccccccccccccccccccccccc",
        fromDelegate: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        toDelegate: "0xcccccccccccccccccccccccccccccccccccccccc",
        isCurrent: false,
        power: 20n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Delegate({
        id: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        fromDelegate: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        toDelegate: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        isCurrent: true,
        power: 50n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new DelegateMapping({
        id: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        from: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        power: 50n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
    ]);

    const handler = buildTokenHandler(store);

    await (handler as any).storeDelegate(
      new Delegate({
        chainId: 1,
        daoCode: "demo",
        governorAddress: "0x9999999999999999999999999999999999999999",
        tokenAddress: "0x8888888888888888888888888888888888888888",
        contractAddress: "0x8888888888888888888888888888888888888888",
        logIndex: 2,
        transactionIndex: 2,
        fromDelegate: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        toDelegate: "0xcccccccccccccccccccccccccccccccccccccccc",
        blockNumber: 2n,
        blockTimestamp: 2n,
        transactionHash: "0xhistorical-delta",
        power: -20n,
      })
    );

    expect(
      store.findEntity(
        DelegateMapping,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      )
    ).toMatchObject({
      to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      power: 50n,
    });
  });

  it("keeps the current delegate relation aligned with delegate mapping even if the stored row drifted", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 100n,
      }),
      new Contributor({
        id: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        power: 50n,
        delegatesCountAll: 1,
        delegatesCountEffective: 1,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Delegate({
        id: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        fromDelegate: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        toDelegate: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        isCurrent: true,
        power: 100n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new DelegateMapping({
        id: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        from: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        power: 50n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
    ]);

    const handler = buildTokenHandler(store);

    await (handler as any).storeDelegate(
      new Delegate({
        chainId: 1,
        daoCode: "demo",
        governorAddress: "0x9999999999999999999999999999999999999999",
        tokenAddress: "0x8888888888888888888888888888888888888888",
        contractAddress: "0x8888888888888888888888888888888888888888",
        logIndex: 2,
        transactionIndex: 2,
        fromDelegate: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        toDelegate: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        blockNumber: 2n,
        blockTimestamp: 2n,
        transactionHash: "0xcurrent-delta",
        power: 10n,
      })
    );

    expect(
      store.findEntity(
        Delegate,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      )
    ).toMatchObject({
      power: 60n,
      isCurrent: true,
    });
    expect(
      store.findEntity(
        DelegateMapping,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      )
    ).toMatchObject({
      to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      power: 60n,
    });
  });

  it("does not double count delegate power when delegate change, transfer, and vote update share a transaction", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 0n,
      }),
    ]);

    const handler = buildTokenHandler(store);

    const sharedLog = {
      address: "0x8888888888888888888888888888888888888888",
      transactionIndex: 1,
      block: {
        height: 13579039,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: "0xb2e42c615286384babed2c89ee5e14c38c98b0221b7baeab958babf735435414",
    } as any;

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValue({
        delegator: "0xd144d064a7e573e8c77c0d0d2049a243c740882f",
        fromDelegate: "0x0000000000000000000000000000000000000000",
        toDelegate: "0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5",
      } as any);

    await (handler as any).storeDelegateChanged({
      ...sharedLog,
      id: "log-delegate-changed",
      logIndex: 99,
    });

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValue({
      from: "0xc18360217d8f7ab5e7c516566761ea12ce7f9d72",
      to: "0xd144d064a7e573e8c77c0d0d2049a243c740882f",
      value: 1143544204434688311296n,
    } as any);

    await (handler as any).storeTokenTransfer({
      ...sharedLog,
      id: "log-transfer",
      logIndex: 100,
    });

    jest
      .spyOn(itokenerc20.events.DelegateVotesChanged, "decode")
      .mockReturnValue({
        delegate: "0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5",
        previousVotes: 0n,
        newVotes: 1143544204434688311296n,
      } as any);

    await (handler as any).storeDelegateVotesChanged({
      ...sharedLog,
      id: "log-votes-changed",
      logIndex: 101,
    });

    expect(
      store.findEntity(
        DelegateMapping,
        "0xd144d064a7e573e8c77c0d0d2049a243c740882f"
      )
    ).toMatchObject({
      to: "0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5",
      power: 1143544204434688311296n,
    });
    expect(
      store.findEntity(
        Delegate,
        "0xd144d064a7e573e8c77c0d0d2049a243c740882f_0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5"
      )
    ).toMatchObject({
      power: 1143544204434688311296n,
      isCurrent: true,
    });
    expect(
      store.findEntity(
        Contributor,
        "0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5"
      )
    ).toMatchObject({
      power: 1143544204434688311296n,
      delegatesCountAll: 1,
      delegatesCountEffective: 1,
    });
  });

  it("returns current delegate mapping power to zero after a full transfer out with no delegate change", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 0n,
      }),
    ]);

    const handler = buildTokenHandler(store);

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValue({
        delegator: "0xd144d064a7e573e8c77c0d0d2049a243c740882f",
        fromDelegate: "0x0000000000000000000000000000000000000000",
        toDelegate: "0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5",
      } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-delegate-changed-init",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 99,
      transactionIndex: 1,
      block: {
        height: 13579039,
        timestamp: 1_700_000_000_000,
      },
      transactionHash:
        "0xb2e42c615286384babed2c89ee5e14c38c98b0221b7baeab958babf735435414",
    } as any);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValue({
      from: "0xc18360217d8f7ab5e7c516566761ea12ce7f9d72",
      to: "0xd144d064a7e573e8c77c0d0d2049a243c740882f",
      value: 1143544204434688311296n,
    } as any);

    await (handler as any).storeTokenTransfer({
      id: "log-transfer-init",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 100,
      transactionIndex: 1,
      block: {
        height: 13579039,
        timestamp: 1_700_000_000_000,
      },
      transactionHash:
        "0xb2e42c615286384babed2c89ee5e14c38c98b0221b7baeab958babf735435414",
    } as any);

    jest
      .spyOn(itokenerc20.events.DelegateVotesChanged, "decode")
      .mockReturnValueOnce({
        delegate: "0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5",
        previousVotes: 0n,
        newVotes: 1143544204434688311296n,
      } as any)
      .mockReturnValueOnce({
        delegate: "0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5",
        previousVotes: 1143544204434688311296n,
        newVotes: 0n,
      } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "log-votes-changed-init",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 101,
      transactionIndex: 1,
      block: {
        height: 13579039,
        timestamp: 1_700_000_000_000,
      },
      transactionHash:
        "0xb2e42c615286384babed2c89ee5e14c38c98b0221b7baeab958babf735435414",
    } as any);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValue({
      from: "0xd144d064a7e573e8c77c0d0d2049a243c740882f",
      to: "0x616116777efa63666436e9d132899467fb9a3d41",
      value: 1143544204434688311296n,
    } as any);

    await (handler as any).storeTokenTransfer({
      id: "log-transfer-out",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 322,
      transactionIndex: 2,
      block: {
        height: 13598117,
        timestamp: 1_700_000_000_100,
      },
      transactionHash:
        "0x66e804e23a6c1d63ce950df2017a3917b7b0106e2abf1d17243b7ab5fdb20f06",
    } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "log-votes-changed-out",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 323,
      transactionIndex: 2,
      block: {
        height: 13598117,
        timestamp: 1_700_000_000_100,
      },
      transactionHash:
        "0x66e804e23a6c1d63ce950df2017a3917b7b0106e2abf1d17243b7ab5fdb20f06",
    } as any);

    expect(
      store.findEntity(
        DelegateMapping,
        "0xd144d064a7e573e8c77c0d0d2049a243c740882f"
      )
    ).toMatchObject({
      to: "0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5",
      power: 0n,
    });
    expect(
      store.findEntity(
        Delegate,
        "0xd144d064a7e573e8c77c0d0d2049a243c740882f_0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5"
      )
    ).toMatchObject({
      power: 0n,
      isCurrent: true,
    });
  });

  it("reactivates a historical relation without carrying forward stale power", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 0n,
      }),
      new Contributor({
        id: "0x8787fc2de4de95c53e5e3a4e5459247d9773ea52",
        power: 10000n,
        delegatesCountAll: 1,
        delegatesCountEffective: 1,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Contributor({
        id: "0x1d5460f896521ad685ea4c3f2c679ec0b6806359",
        power: 0n,
        delegatesCountAll: 0,
        delegatesCountEffective: 0,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Delegate({
        id: "0x406e27929a19b2886d644165f37e7fa34100e2fd_0x8787fc2de4de95c53e5e3a4e5459247d9773ea52",
        fromDelegate: "0x406e27929a19b2886d644165f37e7fa34100e2fd",
        toDelegate: "0x8787fc2de4de95c53e5e3a4e5459247d9773ea52",
        isCurrent: true,
        power: 10000n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Delegate({
        id: "0x406e27929a19b2886d644165f37e7fa34100e2fd_0x1d5460f896521ad685ea4c3f2c679ec0b6806359",
        fromDelegate: "0x406e27929a19b2886d644165f37e7fa34100e2fd",
        toDelegate: "0x1d5460f896521ad685ea4c3f2c679ec0b6806359",
        isCurrent: false,
        power: 10000n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xhistorical",
      }),
      new DelegateMapping({
        id: "0x406e27929a19b2886d644165f37e7fa34100e2fd",
        from: "0x406e27929a19b2886d644165f37e7fa34100e2fd",
        to: "0x8787fc2de4de95c53e5e3a4e5459247d9773ea52",
        power: 10000n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
    ]);

    const handler = buildTokenHandler(store);

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValue({
        delegator: "0x406e27929a19b2886d644165f37e7fa34100e2fd",
        fromDelegate: "0x8787fc2de4de95c53e5e3a4e5459247d9773ea52",
        toDelegate: "0x1d5460f896521ad685ea4c3f2c679ec0b6806359",
      } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-delegate-changed-reactivate",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 133,
      transactionIndex: 1,
      block: {
        height: 24406531,
        timestamp: 1_700_000_000_200,
      },
      transactionHash:
        "0xe29491e8cb273dda45aeea7e54383ca4dd6adb79f83c20663abfa2bc16838aa3",
    } as any);

    jest
      .spyOn(itokenerc20.events.DelegateVotesChanged, "decode")
      .mockReturnValueOnce({
        delegate: "0x8787fc2de4de95c53e5e3a4e5459247d9773ea52",
        previousVotes: 10000n,
        newVotes: 0n,
      } as any)
      .mockReturnValueOnce({
        delegate: "0x1d5460f896521ad685ea4c3f2c679ec0b6806359",
        previousVotes: 0n,
        newVotes: 10000n,
      } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "log-votes-changed-old",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 134,
      transactionIndex: 1,
      block: {
        height: 24406531,
        timestamp: 1_700_000_000_200,
      },
      transactionHash:
        "0xe29491e8cb273dda45aeea7e54383ca4dd6adb79f83c20663abfa2bc16838aa3",
    } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "log-votes-changed-new",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 135,
      transactionIndex: 1,
      block: {
        height: 24406531,
        timestamp: 1_700_000_000_200,
      },
      transactionHash:
        "0xe29491e8cb273dda45aeea7e54383ca4dd6adb79f83c20663abfa2bc16838aa3",
    } as any);

    expect(
      store.findEntity(
        DelegateMapping,
        "0x406e27929a19b2886d644165f37e7fa34100e2fd"
      )
    ).toMatchObject({
      to: "0x1d5460f896521ad685ea4c3f2c679ec0b6806359",
      power: 10000n,
    });
    expect(
      store.findEntity(
        Delegate,
        "0x406e27929a19b2886d644165f37e7fa34100e2fd_0x1d5460f896521ad685ea4c3f2c679ec0b6806359"
      )
    ).toMatchObject({
      power: 10000n,
      isCurrent: true,
    });
  });

  it("does not skip a transfer when the same transaction contains another delegator's delegate change", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 569n,
      }),
      new Contributor({
        id: "0x983110309620d911731ac0932219af06091b6744",
        power: 569n,
        delegatesCountAll: 1,
        delegatesCountEffective: 1,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Delegate({
        id: "0xa47080b9dba577b6c53600163cf6747bdbd8bcc5_0x983110309620d911731ac0932219af06091b6744",
        fromDelegate: "0xa47080b9dba577b6c53600163cf6747bdbd8bcc5",
        toDelegate: "0x983110309620d911731ac0932219af06091b6744",
        isCurrent: true,
        power: 569n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new DelegateMapping({
        id: "0xa47080b9dba577b6c53600163cf6747bdbd8bcc5",
        from: "0xa47080b9dba577b6c53600163cf6747bdbd8bcc5",
        to: "0x983110309620d911731ac0932219af06091b6744",
        power: 569n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
    ]);

    const handler = buildTokenHandler(store);

    jest.spyOn(itokenerc20.events.DelegateChanged, "decode").mockReturnValue({
      delegator: "0x635ab5225546e2cc3174ef4ec8473e3d5f2b4230",
      fromDelegate: zeroAddress,
      toDelegate: "0x480b1a06cb348c1dc673bbfdd74ef19fa1a79a30",
    } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-other-delegate-changed",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 10,
      transactionIndex: 1,
      block: {
        height: 24564859,
        timestamp: 1_700_000_000_300,
      },
      transactionHash:
        "0xf7a9daeb4fb143f6029704c037b972be84adb71294fbf3b4e90ac07d1c8667e7",
    } as any);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValue({
      from: "0xa47080b9dba577b6c53600163cf6747bdbd8bcc5",
      to: "0x635ab5225546e2cc3174ef4ec8473e3d5f2b4230",
      value: 569n,
    } as any);

    await (handler as any).storeTokenTransfer({
      id: "log-transfer-out-with-unrelated-rolling",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 11,
      transactionIndex: 1,
      block: {
        height: 24564859,
        timestamp: 1_700_000_000_300,
      },
      transactionHash:
        "0xf7a9daeb4fb143f6029704c037b972be84adb71294fbf3b4e90ac07d1c8667e7",
    } as any);

    expect(
      store.findEntity(
        DelegateMapping,
        "0xa47080b9dba577b6c53600163cf6747bdbd8bcc5"
      )
    ).toMatchObject({
      to: "0x983110309620d911731ac0932219af06091b6744",
      power: 0n,
    });
    expect(
      store.findEntity(
        Delegate,
        "0xa47080b9dba577b6c53600163cf6747bdbd8bcc5_0x983110309620d911731ac0932219af06091b6744"
      )
    ).toMatchObject({
      power: 0n,
      isCurrent: true,
    });
  });

  it("does not skip an incoming transfer when the same transaction contains another delegator's delegate change", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 49950n,
      }),
      new Contributor({
        id: "0x534631bcf33bdb069fb20a93d2fdb9e4d4dd42cf",
        power: 49950n,
        delegatesCountAll: 1,
        delegatesCountEffective: 1,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Delegate({
        id: "0x53b387b0f9017007d3a56c57c5f28317b97c059f_0x534631bcf33bdb069fb20a93d2fdb9e4d4dd42cf",
        fromDelegate: "0x53b387b0f9017007d3a56c57c5f28317b97c059f",
        toDelegate: "0x534631bcf33bdb069fb20a93d2fdb9e4d4dd42cf",
        isCurrent: true,
        power: 49950n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new DelegateMapping({
        id: "0x53b387b0f9017007d3a56c57c5f28317b97c059f",
        from: "0x53b387b0f9017007d3a56c57c5f28317b97c059f",
        to: "0x534631bcf33bdb069fb20a93d2fdb9e4d4dd42cf",
        power: 49950n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
    ]);

    const handler = buildTokenHandler(store);

    jest.spyOn(itokenerc20.events.DelegateChanged, "decode").mockReturnValue({
      delegator: "0x0a27ec76365f0cb061fd6da38aff724a7357e9b6",
      fromDelegate: zeroAddress,
      toDelegate: "0xd5d171a9aa125af13216c3213b5a9fc793fccf2c",
    } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-other-delegate-changed-incoming",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 20,
      transactionIndex: 1,
      block: {
        height: 22147134,
        timestamp: 1_700_000_000_400,
      },
      transactionHash:
        "0x32e3060b0d12919d203817fd4918fa6216a2da51adaf2b857f66f961452fd04d",
    } as any);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValue({
      from: "0x39a057b63b62907a7a8c8f2a6fa743892bea64f1",
      to: "0x53b387b0f9017007d3a56c57c5f28317b97c059f",
      value: 50n,
    } as any);

    await (handler as any).storeTokenTransfer({
      id: "log-transfer-in-with-unrelated-rolling",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 21,
      transactionIndex: 1,
      block: {
        height: 22147134,
        timestamp: 1_700_000_000_400,
      },
      transactionHash:
        "0x32e3060b0d12919d203817fd4918fa6216a2da51adaf2b857f66f961452fd04d",
    } as any);

    expect(
      store.findEntity(
        DelegateMapping,
        "0x53b387b0f9017007d3a56c57c5f28317b97c059f",
      ),
    ).toMatchObject({
      to: "0x534631bcf33bdb069fb20a93d2fdb9e4d4dd42cf",
      power: 50000n,
    });
    expect(
      store.findEntity(
        Delegate,
        "0x53b387b0f9017007d3a56c57c5f28317b97c059f_0x534631bcf33bdb069fb20a93d2fdb9e4d4dd42cf",
      ),
    ).toMatchObject({
      power: 50000n,
      isCurrent: true,
    });
  });

  it("zeros the historical relation when a delegate change closes an old edge even if the stored row is stale", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 4300n,
      }),
      new Contributor({
        id: "0xd4a46a9ef66d7352790f131fe49e7cf84ae68b55",
        power: 4300n,
        delegatesCountAll: 1,
        delegatesCountEffective: 1,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Contributor({
        id: "0x1f3d3a7a9c548be39539b39d7400302753e20591",
        power: 100n,
        delegatesCountAll: 0,
        delegatesCountEffective: 0,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Delegate({
        id: "0x53fa6d5428f16e4e8b67ff29b5c95aa53239c653_0xd4a46a9ef66d7352790f131fe49e7cf84ae68b55",
        fromDelegate: "0x53fa6d5428f16e4e8b67ff29b5c95aa53239c653",
        toDelegate: "0xd4a46a9ef66d7352790f131fe49e7cf84ae68b55",
        isCurrent: true,
        power: -1000n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xstale",
      }),
      new DelegateMapping({
        id: "0x53fa6d5428f16e4e8b67ff29b5c95aa53239c653",
        from: "0x53fa6d5428f16e4e8b67ff29b5c95aa53239c653",
        to: "0xd4a46a9ef66d7352790f131fe49e7cf84ae68b55",
        power: 4300n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
    ]);

    const handler = buildTokenHandler(store);

    jest.spyOn(itokenerc20.events.DelegateChanged, "decode").mockReturnValue({
      delegator: "0x53fa6d5428f16e4e8b67ff29b5c95aa53239c653",
      fromDelegate: "0xd4a46a9ef66d7352790f131fe49e7cf84ae68b55",
      toDelegate: "0x1f3d3a7a9c548be39539b39d7400302753e20591",
    } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-delegate-changed-close-old-edge",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 30,
      transactionIndex: 1,
      block: {
        height: 21298075,
        timestamp: 1_700_000_000_500,
      },
      transactionHash:
        "0x233a2b684c19aba174f4c8b1e6dfb66946746cdf91a6f54748a23545d12e541d",
    } as any);

    jest
      .spyOn(itokenerc20.events.DelegateVotesChanged, "decode")
      .mockReturnValueOnce({
        delegate: "0xd4a46a9ef66d7352790f131fe49e7cf84ae68b55",
        previousVotes: 4300n,
        newVotes: 0n,
      } as any)
      .mockReturnValueOnce({
        delegate: "0x1f3d3a7a9c548be39539b39d7400302753e20591",
        previousVotes: 100n,
        newVotes: 4400n,
      } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "log-votes-changed-old-delegate",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 31,
      transactionIndex: 1,
      block: {
        height: 21298075,
        timestamp: 1_700_000_000_500,
      },
      transactionHash:
        "0x233a2b684c19aba174f4c8b1e6dfb66946746cdf91a6f54748a23545d12e541d",
    } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "log-votes-changed-new-delegate",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 32,
      transactionIndex: 1,
      block: {
        height: 21298075,
        timestamp: 1_700_000_000_500,
      },
      transactionHash:
        "0x233a2b684c19aba174f4c8b1e6dfb66946746cdf91a6f54748a23545d12e541d",
    } as any);

    expect(
      store.findEntity(
        Delegate,
        "0x53fa6d5428f16e4e8b67ff29b5c95aa53239c653_0xd4a46a9ef66d7352790f131fe49e7cf84ae68b55",
      ),
    ).toMatchObject({
      power: 0n,
      isCurrent: false,
    });
    expect(
      store.findEntity(
        Contributor,
        "0xd4a46a9ef66d7352790f131fe49e7cf84ae68b55",
      ),
    ).toMatchObject({
      power: 0n,
    });
    expect(
      store.findEntity(
        DelegateMapping,
        "0x53fa6d5428f16e4e8b67ff29b5c95aa53239c653",
      ),
    ).toMatchObject({
      to: "0x1f3d3a7a9c548be39539b39d7400302753e20591",
      power: 4300n,
    });
  });

  it("keeps the current delegate row synchronized with delegate mapping after transfer updates", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 100n,
      }),
      new Contributor({
        id: "0xbdb41bff7e828e2dc2d15eb67257455db818f1dc",
        power: 100n,
        delegatesCountAll: 1,
        delegatesCountEffective: 1,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Delegate({
        id: "0x1860207b3ccb2c318a5ee0f20d20e0a80d68bd74_0xbdb41bff7e828e2dc2d15eb67257455db818f1dc",
        fromDelegate: "0x1860207b3ccb2c318a5ee0f20d20e0a80d68bd74",
        toDelegate: "0xbdb41bff7e828e2dc2d15eb67257455db818f1dc",
        isCurrent: true,
        power: -50n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xstale",
      }),
      new DelegateMapping({
        id: "0x1860207b3ccb2c318a5ee0f20d20e0a80d68bd74",
        from: "0x1860207b3ccb2c318a5ee0f20d20e0a80d68bd74",
        to: "0xbdb41bff7e828e2dc2d15eb67257455db818f1dc",
        power: 100n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
    ]);

    const handler = buildTokenHandler(store);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValue({
      from: "0x1860207b3ccb2c318a5ee0f20d20e0a80d68bd74",
      to: "0x000000000000000000000000000000000000dead",
      value: 40n,
    } as any);

    await (handler as any).storeTokenTransfer({
      id: "log-transfer-sync-current-relation",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 41,
      transactionIndex: 1,
      block: {
        height: 24564859,
        timestamp: 1_700_000_000_600,
      },
      transactionHash:
        "0xf7a9daeb4fb143f6029704c037b972be84adb71294fbf3b4e90ac07d1c8667e7",
    } as any);

    expect(
      store.findEntity(
        DelegateMapping,
        "0x1860207b3ccb2c318a5ee0f20d20e0a80d68bd74",
      ),
    ).toMatchObject({
      to: "0xbdb41bff7e828e2dc2d15eb67257455db818f1dc",
      power: 60n,
    });
    expect(
      store.findEntity(
        Delegate,
        "0x1860207b3ccb2c318a5ee0f20d20e0a80d68bd74_0xbdb41bff7e828e2dc2d15eb67257455db818f1dc",
      ),
    ).toMatchObject({
      power: 60n,
      isCurrent: true,
    });
    expect(
      store.findEntity(
        Contributor,
        "0xbdb41bff7e828e2dc2d15eb67257455db818f1dc",
      ),
    ).toMatchObject({
      power: 60n,
    });
  });

  it("keeps the current delegate row at zero when a full transfer drains the current mapping", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 100n,
      }),
      new Contributor({
        id: "0x48dbb9b7b562acf3c38e53deaff4686e24c3d85d",
        power: 100n,
        delegatesCountAll: 1,
        delegatesCountEffective: 1,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Delegate({
        id: "0x48dbb9b7b562acf3c38e53deaff4686e24c3d85d_0x48dbb9b7b562acf3c38e53deaff4686e24c3d85d",
        fromDelegate: "0x48dbb9b7b562acf3c38e53deaff4686e24c3d85d",
        toDelegate: "0x48dbb9b7b562acf3c38e53deaff4686e24c3d85d",
        isCurrent: true,
        power: -25n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xstale",
      }),
      new DelegateMapping({
        id: "0x48dbb9b7b562acf3c38e53deaff4686e24c3d85d",
        from: "0x48dbb9b7b562acf3c38e53deaff4686e24c3d85d",
        to: "0x48dbb9b7b562acf3c38e53deaff4686e24c3d85d",
        power: 100n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
    ]);

    const handler = buildTokenHandler(store);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValue({
      from: "0x48dbb9b7b562acf3c38e53deaff4686e24c3d85d",
      to: "0x000000000000000000000000000000000000dead",
      value: 100n,
    } as any);

    await (handler as any).storeTokenTransfer({
      id: "log-transfer-zero-current-relation",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 42,
      transactionIndex: 1,
      block: {
        height: 13578885,
        timestamp: 1_700_000_000_700,
      },
      transactionHash:
        "0xbd177d6d9bc80026933e85af18d7b8e17084d68803713c6a621e081a8674b359",
    } as any);

    expect(
      store.findEntity(
        DelegateMapping,
        "0x48dbb9b7b562acf3c38e53deaff4686e24c3d85d",
      ),
    ).toMatchObject({
      to: "0x48dbb9b7b562acf3c38e53deaff4686e24c3d85d",
      power: 0n,
    });
    expect(
      store.findEntity(
        Delegate,
        "0x48dbb9b7b562acf3c38e53deaff4686e24c3d85d_0x48dbb9b7b562acf3c38e53deaff4686e24c3d85d",
      ),
    ).toMatchObject({
      power: 0n,
      isCurrent: true,
    });
    expect(
      store.findEntity(
        Contributor,
        "0x48dbb9b7b562acf3c38e53deaff4686e24c3d85d",
      ),
    ).toMatchObject({
      power: 0n,
    });
  });

  it("tracks ERC721 transfers as token ids while applying single-vote power deltas", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 2n,
      }),
      new Contributor({
        id: "0x1111111111111111111111111111111111111111",
        power: 1n,
        delegatesCountAll: 1,
        delegatesCountEffective: 1,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Contributor({
        id: "0x2222222222222222222222222222222222222222",
        power: 1n,
        delegatesCountAll: 1,
        delegatesCountEffective: 1,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Delegate({
        id: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_0x1111111111111111111111111111111111111111",
        fromDelegate: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        toDelegate: "0x1111111111111111111111111111111111111111",
        isCurrent: true,
        power: 1n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Delegate({
        id: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb_0x2222222222222222222222222222222222222222",
        fromDelegate: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
        toDelegate: "0x2222222222222222222222222222222222222222",
        isCurrent: true,
        power: 1n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new DelegateMapping({
        id: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        from: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        to: "0x1111111111111111111111111111111111111111",
        power: 1n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new DelegateMapping({
        id: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        from: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        to: "0x2222222222222222222222222222222222222222",
        power: 1n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
    ]);

    const handler = buildTokenHandler(store, "ERC721");

    jest.spyOn(itokenerc721.events.Transfer, "decode").mockReturnValue({
      from: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
      to: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
      tokenId: 1234n,
    } as any);

    await (handler as any).storeTokenTransfer({
      id: "log-erc721-transfer",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 1,
      transactionIndex: 1,
      block: {
        height: 15,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: "0xerc721-transfer",
    } as any);

    expect(store.findEntity(TokenTransfer, "log-erc721-transfer")).toMatchObject({
      from: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      value: 1234n,
      standard: "erc721",
      transactionHash: "0xerc721-transfer",
    });
    expect(
      store.findEntity(
        Delegate,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_0x1111111111111111111111111111111111111111",
      ),
    ).toMatchObject({
      power: 0n,
      isCurrent: true,
    });
    expect(
      store.findEntity(
        Delegate,
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb_0x2222222222222222222222222222222222222222",
      ),
    ).toMatchObject({
      power: 2n,
      isCurrent: true,
    });
    expect(
      store.findEntity(Contributor, "0x1111111111111111111111111111111111111111"),
    ).toMatchObject({
      power: 0n,
      delegatesCountEffective: 0,
    });
    expect(
      store.findEntity(Contributor, "0x2222222222222222222222222222222222222222"),
    ).toMatchObject({
      power: 2n,
      delegatesCountEffective: 1,
    });
    expect(store.findEntity(DataMetric, "global")?.powerSum).toBe(2n);
  });
});

class MemoryStore {
  private readonly records = new Map<string, Map<string, any>>();

  constructor(entities: any[] = []) {
    for (const entity of entities) {
      this.upsert(entity);
    }
  }

  async findOne(entity: any, options: { where: Record<string, unknown> }) {
    const values = [...(this.records.get(entity.name)?.values() ?? [])];
    return values.find((record) =>
      Object.entries(options.where).every(([key, value]) => record[key] === value)
    );
  }

  async insert(entity: any) {
    this.upsert(entity);
  }

  async save(entity: any) {
    this.upsert(entity);
  }

  async remove(entity: any, id: string) {
    this.records.get(entity.name)?.delete(id);
  }

  findEntity(entity: any, id: string) {
    return this.records.get(entity.name)?.get(id);
  }

  private upsert(entity: any) {
    const name = entity.constructor.name;
    const bucket = this.records.get(name) ?? new Map<string, any>();
    bucket.set(entity.id, entity);
    this.records.set(name, bucket);
  }
}

function buildTokenHandler(store: MemoryStore, standard: "ERC20" | "ERC721" = "ERC20") {
  return new TokenHandler(
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
            standard,
          },
        ],
      },
      indexContract: {
        name: "governorToken",
        address: "0x8888888888888888888888888888888888888888",
        standard,
      },
      chainTool: new ChainTool(),
    }
  );
}
