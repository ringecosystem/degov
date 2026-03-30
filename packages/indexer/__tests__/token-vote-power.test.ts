import {
  classifyVotePowerCheckpointCause,
  TokenHandler,
  votePowerTimepointForLog,
} from "../src/handler/token";
import * as itokenerc20 from "../src/abi/itokenerc20";
import * as itokenerc721 from "../src/abi/itokenerc721";
import { ChainTool, ClockMode } from "../src/internal/chaintool";
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
