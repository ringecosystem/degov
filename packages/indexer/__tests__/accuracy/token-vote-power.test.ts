import {
  classifyVotePowerCheckpointCause,
  TokenHandler,
  votePowerTimepointForLog,
} from "../../src/handler/token";
import * as itokenerc20 from "../../src/abi/itokenerc20";
import * as itokenerc721 from "../../src/abi/itokenerc721";
import { ChainTool, ClockMode } from "../../src/internal/chaintool";
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
} from "../../src/model";

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
      delegatesCountEffective: 0,
    });
    expect(store.findEntity(DataMetric, "global")?.powerSum).toBe(0n);
    expect(
      store.findEntity(Contributor, "0x0000000000000000000000000000000000000000")
    ).toBeUndefined();
  });

  it("keeps first self-delegation power when a mint transfer is logged before the delegate change", async () => {
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
    const account = "0x297bf847dcb01f3e870515628b36eabad491e5e8";
    const txHash =
      "0x54e1f8189eaf2f1db1bb8be054d088676ccc45597de198fb141e5001d45dd55d";

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValueOnce({
      from: zeroAddress,
      to: account,
      value: 56287540000000000000000n,
    } as any);

    await (handler as any).storeTokenTransfer({
      id: "hai-transfer-in",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 83,
      transactionIndex: 7,
      block: {
        height: 116466459,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: txHash,
    } as any);

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValueOnce({
        delegator: account,
        fromDelegate: zeroAddress,
        toDelegate: account,
      } as any);

    await (handler as any).storeDelegateChanged({
      id: "hai-self-delegate",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 86,
      transactionIndex: 7,
      block: {
        height: 116466459,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: txHash,
    } as any);

    jest
      .spyOn(itokenerc20.events.DelegateVotesChanged, "decode")
      .mockReturnValueOnce({
        delegate: account,
        previousVotes: 0n,
        newVotes: 56287540000000000000000n,
      } as any)
      .mockReturnValueOnce({
        delegate: account,
        previousVotes: 56287540000000000000000n,
        newVotes: 50000540000000000000000n,
      } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "hai-dvc-plus",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 87,
      transactionIndex: 7,
      block: {
        height: 116466459,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: txHash,
    } as any);

    expect(store.findEntity(DelegateMapping, account)).toMatchObject({
      from: account,
      to: account,
      power: 56287540000000000000000n,
    });
    expect(store.findEntity(Delegate, `${account}_${account}`)).toMatchObject({
      power: 56287540000000000000000n,
      isCurrent: true,
    });
    expect(store.findEntity(Contributor, account)).toMatchObject({
      power: 56287540000000000000000n,
      delegatesCountAll: 1,
    });
    expect(store.findEntity(DataMetric, "global")?.powerSum).toBe(
      56287540000000000000000n,
    );

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValueOnce({
      from: account,
      to: "0x1111111111111111111111111111111111111111",
      value: 6287000000000000000000n,
    } as any);

    await (handler as any).storeTokenTransfer({
      id: "hai-transfer-out",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 10,
      transactionIndex: 1,
      block: {
        height: 132281981,
        timestamp: 1_700_000_000_100,
      },
      transactionHash:
        "0x7bf784bc12bfe94757c370dcc37e012755e5c086ad404592cc8fd14f1c21b110",
    } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "hai-dvc-minus",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 11,
      transactionIndex: 1,
      block: {
        height: 132281981,
        timestamp: 1_700_000_000_100,
      },
      transactionHash:
        "0x7bf784bc12bfe94757c370dcc37e012755e5c086ad404592cc8fd14f1c21b110",
    } as any);

    expect(store.findEntity(DelegateMapping, account)).toMatchObject({
      power: 50000540000000000000000n,
    });
    expect(store.findEntity(Delegate, `${account}_${account}`)).toMatchObject({
      power: 50000540000000000000000n,
      isCurrent: true,
    });
    expect(store.findEntity(Contributor, account)).toMatchObject({
      power: 50000540000000000000000n,
    });
    expect(store.findEntity(DataMetric, "global")?.powerSum).toBe(
      50000540000000000000000n,
    );
  });

  it("materializes an ENS-style first self-delegation when transfer precedes the delegate change", async () => {
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
    const account = "0x4e88f436422075c1417357bf957764c127b2cc93";
    const txHash =
      "0xba0936d33054615c8c5d914825b7e98ffd3ebb9a768b0077279618e3dab900e8";

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValueOnce({
      from: "0xc18360217d8f7ab5e7c516566761ea12ce7f9d72",
      to: account,
      value: 402598135628414973952n,
    } as any);

    await (handler as any).storeTokenTransfer({
      id: "ens-transfer-in",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 100,
      transactionIndex: 5,
      block: {
        height: 13578856,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: txHash,
    } as any);

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValueOnce({
        delegator: account,
        fromDelegate: zeroAddress,
        toDelegate: account,
      } as any);

    await (handler as any).storeDelegateChanged({
      id: "ens-self-delegate",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 101,
      transactionIndex: 5,
      block: {
        height: 13578856,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: txHash,
    } as any);

    jest
      .spyOn(itokenerc20.events.DelegateVotesChanged, "decode")
      .mockReturnValueOnce({
        delegate: account,
        previousVotes: 0n,
        newVotes: 402598135628414973952n,
      } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "ens-dvc-plus",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 102,
      transactionIndex: 5,
      block: {
        height: 13578856,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: txHash,
    } as any);

    expect(store.findEntity(DelegateMapping, account)).toMatchObject({
      from: account,
      to: account,
      power: 402598135628414973952n,
    });
    expect(store.findEntity(Delegate, `${account}_${account}`)).toMatchObject({
      power: 402598135628414973952n,
      isCurrent: true,
    });
    expect(store.findEntity(Contributor, account)).toMatchObject({
      power: 402598135628414973952n,
      delegatesCountAll: 1,
    });
    expect(store.findEntity(DataMetric, "global")?.powerSum).toBe(
      402598135628414973952n,
    );
  });

  it("materializes a first delegation to another delegate when transfer precedes the delegate change", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 57785513868238169417755n,
      }),
      new Contributor({
        id: "0x297bf847dcb01f3e870515628b36eabad491e5e8",
        power: 57785513868238169417755n,
        delegatesCountAll: 446,
        delegatesCountEffective: 326,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
    ]);
    const handler = buildTokenHandler(store);
    jest
      .spyOn(handler as any, "voteClockMode")
      .mockResolvedValue(ClockMode.BlockNumber);

    const delegator = "0x6a43e60d5520912d20f19eb29a011e82a6ee50ae";
    const delegate = "0x297bf847dcb01f3e870515628b36eabad491e5e8";
    const openTx =
      "0xfa6c6ca47492aef83ee005b55c52705ccc2f3a02ff883dab94cd295c2b25221c";
    const transferOutTx =
      "0x16b33d603a745a88fc72a1ab07e0e03dffb62dcc362d7adc6854d8080fb78ccc";

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValueOnce({
      from: zeroAddress,
      to: delegator,
      value: 631950000000000000000n,
    } as any);

    await (handler as any).storeTokenTransfer({
      id: "hai-open-transfer-in",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 21,
      transactionIndex: 1,
      block: {
        height: 117212258,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: openTx,
    } as any);

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValueOnce({
        delegator,
        fromDelegate: zeroAddress,
        toDelegate: delegate,
      } as any);

    await (handler as any).storeDelegateChanged({
      id: "hai-open-delegate-change",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 23,
      transactionIndex: 1,
      block: {
        height: 117212258,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: openTx,
    } as any);

    jest
      .spyOn(itokenerc20.events.DelegateVotesChanged, "decode")
      .mockReturnValueOnce({
        delegate,
        previousVotes: 57785513868238169417755n,
        newVotes: 58417463868238169417755n,
      } as any)
      .mockReturnValueOnce({
        delegate,
        previousVotes: 57797482743238169417755n,
        newVotes: 57785513868238169417755n,
      } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "hai-open-dvc-plus",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 24,
      transactionIndex: 1,
      block: {
        height: 117212258,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: openTx,
    } as any);

    expect(store.findEntity(DelegateMapping, delegator)).toMatchObject({
      from: delegator,
      to: delegate,
      power: 631950000000000000000n,
    });
    expect(
      store.findEntity(Delegate, `${delegator}_${delegate}`),
    ).toMatchObject({
      power: 631950000000000000000n,
      isCurrent: true,
    });

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValueOnce({
      from: delegator,
      to: "0xdef171fe48cf0115b1d80b88dc8eab59176fee57",
      value: 11968875000000000000n,
    } as any);

    await (handler as any).storeTokenTransfer({
      id: "hai-transfer-out",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 4,
      transactionIndex: 1,
      block: {
        height: 117213102,
        timestamp: 1_700_000_000_100,
      },
      transactionHash: transferOutTx,
    } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "hai-transfer-out-dvc",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 5,
      transactionIndex: 1,
      block: {
        height: 117213102,
        timestamp: 1_700_000_000_100,
      },
      transactionHash: transferOutTx,
    } as any);

    expect(store.findEntity(DelegateMapping, delegator)).toMatchObject({
      power: 619981125000000000000n,
    });
    expect(
      store.findEntity(Delegate, `${delegator}_${delegate}`),
    ).toMatchObject({
      power: 619981125000000000000n,
      isCurrent: true,
    });
    expect(store.findEntity(Contributor, delegate)).toMatchObject({
      power: 58405494993238169417755n,
    });
    expect(store.findEntity(DataMetric, "global")?.powerSum).toBe(
      58405494993238169417755n,
    );
  });

  it("materializes another HAI first delegation when mint transfer happens before delegate change", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 17056200000000000000000n,
      }),
      new Contributor({
        id: "0xcafd432b7ecafff352d92fcb81c60380d437e99d",
        power: 17056200000000000000000n,
        delegatesCountAll: 120,
        delegatesCountEffective: 120,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
    ]);
    const handler = buildTokenHandler(store);
    jest
      .spyOn(handler as any, "voteClockMode")
      .mockResolvedValue(ClockMode.BlockNumber);

    const delegator = "0xd37f7b32a541d9e423f759dff1dd63181651bd04";
    const delegate = "0xcafd432b7ecafff352d92fcb81c60380d437e99d";
    const txHash =
      "0x220cfe77e0f7427412ac8eb910b988acef4514c0dfe49827745c408382767618";

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValueOnce({
      from: zeroAddress,
      to: delegator,
      value: 1199650000000000000000n,
    } as any);

    await (handler as any).storeTokenTransfer({
      id: "hai-cafd-open-transfer",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 26,
      transactionIndex: 1,
      block: {
        height: 118303771,
        timestamp: 1_700_000_000_200,
      },
      transactionHash: txHash,
    } as any);

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValueOnce({
        delegator,
        fromDelegate: zeroAddress,
        toDelegate: delegate,
      } as any);

    await (handler as any).storeDelegateChanged({
      id: "hai-cafd-open-delegate-change",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 27,
      transactionIndex: 1,
      block: {
        height: 118303771,
        timestamp: 1_700_000_000_200,
      },
      transactionHash: txHash,
    } as any);

    jest
      .spyOn(itokenerc20.events.DelegateVotesChanged, "decode")
      .mockReturnValueOnce({
        delegate,
        previousVotes: 17056200000000000000000n,
        newVotes: 18255850000000000000000n,
      } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "hai-cafd-open-dvc",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 28,
      transactionIndex: 1,
      block: {
        height: 118303771,
        timestamp: 1_700_000_000_200,
      },
      transactionHash: txHash,
    } as any);

    expect(store.findEntity(DelegateMapping, delegator)).toMatchObject({
      from: delegator,
      to: delegate,
      power: 1199650000000000000000n,
    });
    expect(
      store.findEntity(Delegate, `${delegator}_${delegate}`),
    ).toMatchObject({
      power: 1199650000000000000000n,
      isCurrent: true,
    });
    expect(store.findEntity(Contributor, delegate)).toMatchObject({
      power: 18255850000000000000000n,
    });
    expect(store.findEntity(DataMetric, "global")?.powerSum).toBe(
      18255850000000000000000n,
    );
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

  it("does not materialize a duplicate self-edge when initial self-delegation is seen before same-tx transfer-in", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 0n,
      }),
    ]);

    const originalInsert = store.insert.bind(store);
    const insertSpy = jest
      .spyOn(store, "insert")
      .mockImplementation(async (entity: any) => {
        await originalInsert(entity);
      });

    const handler = buildTokenHandler(store);
    const account = "0xd144d064a7e573e8c77c0d0d2049a243c740882f";
    const txHash =
      "0xb2e42c615286384babed2c89ee5e14c38c98b0221b7baeab958babf735435414";
    const amount = 1143544204434688311296n;

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValueOnce({
        delegator: account,
        fromDelegate: zeroAddress,
        toDelegate: account,
      } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-self-delegate-before-transfer",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 99,
      transactionIndex: 1,
      block: {
        height: 13579039,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: txHash,
    } as any);

    expect(store.findEntity(DelegateMapping, account)).toMatchObject({
      from: account,
      to: account,
      power: 0n,
    });
    expect(store.findEntity(Delegate, `${account}_${account}`)).toMatchObject({
      power: 0n,
      isCurrent: true,
    });
    expect(
      insertSpy.mock.calls.filter(
        ([entity]) =>
          entity instanceof Delegate &&
          entity.fromDelegate === account &&
          entity.toDelegate === account
      )
    ).toHaveLength(1);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValueOnce({
      from: "0xc18360217d8f7ab5e7c516566761ea12ce7f9d72",
      to: account,
      value: amount,
    } as any);

    await (handler as any).storeTokenTransfer({
      id: "log-transfer-after-self-delegate",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 100,
      transactionIndex: 1,
      block: {
        height: 13579039,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: txHash,
    } as any);

    expect(store.findEntity(DelegateMapping, account)).toMatchObject({
      from: account,
      to: account,
      power: 0n,
    });
    expect(store.findEntity(Delegate, `${account}_${account}`)).toMatchObject({
      power: 0n,
      isCurrent: true,
    });
    expect(
      insertSpy.mock.calls.filter(
        ([entity]) =>
          entity instanceof Delegate &&
          entity.fromDelegate === account &&
          entity.toDelegate === account
      )
    ).toHaveLength(1);
    expect(store.findEntity(Contributor, account)).toMatchObject({
      power: 0n,
      delegatesCountAll: 1,
      delegatesCountEffective: 0,
    });
    expect(store.findEntity(DataMetric, "global")?.powerSum).toBe(0n);

    jest
      .spyOn(itokenerc20.events.DelegateVotesChanged, "decode")
      .mockReturnValueOnce({
        delegate: account,
        previousVotes: 0n,
        newVotes: amount,
      } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "log-self-delegate-votes-changed",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 101,
      transactionIndex: 1,
      block: {
        height: 13579039,
        timestamp: 1_700_000_000_000,
      },
      transactionHash: txHash,
    } as any);

    expect(store.findEntity(DelegateMapping, account)).toMatchObject({
      from: account,
      to: account,
      power: amount,
    });
    expect(store.findEntity(Delegate, `${account}_${account}`)).toMatchObject({
      power: amount,
      isCurrent: true,
    });
    expect(store.findEntity(Contributor, account)).toMatchObject({
      power: amount,
      delegatesCountAll: 1,
      delegatesCountEffective: 1,
    });
    expect(store.findEntity(DataMetric, "global")?.powerSum).toBe(amount);
  });

  it("counts a zero-power current relation as effective only after vote power materializes", async () => {
    const account = "0x5656565656565656565656565656565656565656";
    const amount = 42n;
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 0n,
      }),
      new Contributor({
        id: account,
        power: 0n,
        delegatesCountAll: 1,
        delegatesCountEffective: 0,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Delegate({
        id: `${account}_${account}`,
        fromDelegate: account,
        toDelegate: account,
        isCurrent: true,
        power: 0n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new DelegateMapping({
        id: account,
        from: account,
        to: account,
        power: 0n,
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
        transactionIndex: 1,
        fromDelegate: account,
        toDelegate: account,
        blockNumber: 2n,
        blockTimestamp: 2n,
        transactionHash: "0xmaterialize",
        power: amount,
        isCurrent: true,
      }),
    );

    expect(store.findEntity(DelegateMapping, account)).toMatchObject({
      from: account,
      to: account,
      power: amount,
    });
    expect(store.findEntity(Delegate, `${account}_${account}`)).toMatchObject({
      power: amount,
      isCurrent: true,
    });
    expect(store.findEntity(Contributor, account)).toMatchObject({
      power: amount,
      delegatesCountAll: 1,
      delegatesCountEffective: 1,
    });
    expect(store.findEntity(DataMetric, "global")?.powerSum).toBe(amount);
  });

  it("drops delegatesCountEffective when a current relation loses all materialized power", async () => {
    const account = "0x7878787878787878787878787878787878787878";
    const amount = 42n;
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: amount,
      }),
      new Contributor({
        id: account,
        power: amount,
        delegatesCountAll: 1,
        delegatesCountEffective: 1,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Delegate({
        id: `${account}_${account}`,
        fromDelegate: account,
        toDelegate: account,
        isCurrent: true,
        power: amount,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new DelegateMapping({
        id: account,
        from: account,
        to: account,
        power: amount,
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
        transactionIndex: 1,
        fromDelegate: account,
        toDelegate: account,
        blockNumber: 2n,
        blockTimestamp: 2n,
        transactionHash: "0xdematerialize",
        power: -amount,
        isCurrent: true,
      }),
    );

    expect(store.findEntity(DelegateMapping, account)).toMatchObject({
      from: account,
      to: account,
      power: 0n,
    });
    expect(store.findEntity(Delegate, `${account}_${account}`)).toMatchObject({
      power: 0n,
      isCurrent: true,
    });
    expect(store.findEntity(Contributor, account)).toMatchObject({
      power: 0n,
      delegatesCountAll: 1,
      delegatesCountEffective: 0,
    });
    expect(store.findEntity(DataMetric, "global")?.powerSum).toBe(0n);
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

  it("lets transfer materialize zero-to-delegate relations even when the same transaction has duplicate noop delegate changes", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 0n,
      }),
    ]);
    const handler = buildTokenHandler(store);

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValueOnce({
        delegator: "0x8afe3f1f3c0e4361cfff451f0a6a67b540177006",
        fromDelegate: zeroAddress,
        toDelegate: "0x839395e20bbb182fa440d08f850e6c7a8f6f0780",
      } as any)
      .mockReturnValueOnce({
        delegator: "0x8afe3f1f3c0e4361cfff451f0a6a67b540177006",
        fromDelegate: "0x839395e20bbb182fa440d08f850e6c7a8f6f0780",
        toDelegate: "0x839395e20bbb182fa440d08f850e6c7a8f6f0780",
      } as any)
      .mockReturnValueOnce({
        delegator: "0x144a042618fb80931f94a6f7daeba00cd200e549",
        fromDelegate: zeroAddress,
        toDelegate: "0x839395e20bbb182fa440d08f850e6c7a8f6f0780",
      } as any)
      .mockReturnValueOnce({
        delegator: "0x144a042618fb80931f94a6f7daeba00cd200e549",
        fromDelegate: "0x839395e20bbb182fa440d08f850e6c7a8f6f0780",
        toDelegate: "0x839395e20bbb182fa440d08f850e6c7a8f6f0780",
      } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-dc-8afe-open",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 29,
      transactionIndex: 1,
      block: { height: 21709282, timestamp: 1_700_000_000_800 },
      transactionHash:
        "0xbf10993cf8cbcef7abfdd8708b9dcb5b91bcaff748139bf602929f77d0580980",
    } as any);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValueOnce({
      from: "0x73cd8626b3cd47b009e68380720cfe6679a3ec3d",
      to: "0x8afe3f1f3c0e4361cfff451f0a6a67b540177006",
      value: 2261028221714870294397n,
    } as any);
    await (handler as any).storeTokenTransfer({
      id: "log-transfer-8afe-in",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 30,
      transactionIndex: 1,
      block: { height: 21709282, timestamp: 1_700_000_000_800 },
      transactionHash:
        "0xbf10993cf8cbcef7abfdd8708b9dcb5b91bcaff748139bf602929f77d0580980",
    } as any);

    jest
      .spyOn(itokenerc20.events.DelegateVotesChanged, "decode")
      .mockReturnValueOnce({
        delegate: "0x839395e20bbb182fa440d08f850e6c7a8f6f0780",
        previousVotes: 125715773977914439809358n,
        newVotes: 127976802199629310103755n,
      } as any)
      .mockReturnValueOnce({
        delegate: "0x839395e20bbb182fa440d08f850e6c7a8f6f0780",
        previousVotes: 127976802199629310103755n,
        newVotes: 128368248058829310103755n,
      } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "log-dvc-8afe",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 31,
      transactionIndex: 1,
      block: { height: 21709282, timestamp: 1_700_000_000_800 },
      transactionHash:
        "0xbf10993cf8cbcef7abfdd8708b9dcb5b91bcaff748139bf602929f77d0580980",
    } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-dc-8afe-noop",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 33,
      transactionIndex: 1,
      block: { height: 21709282, timestamp: 1_700_000_000_800 },
      transactionHash:
        "0xbf10993cf8cbcef7abfdd8708b9dcb5b91bcaff748139bf602929f77d0580980",
    } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-dc-144a-open",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 34,
      transactionIndex: 1,
      block: { height: 21709282, timestamp: 1_700_000_000_800 },
      transactionHash:
        "0xbf10993cf8cbcef7abfdd8708b9dcb5b91bcaff748139bf602929f77d0580980",
    } as any);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValueOnce({
      from: "0x73cd8626b3cd47b009e68380720cfe6679a3ec3d",
      to: "0x144a042618fb80931f94a6f7daeba00cd200e549",
      value: 391445859200000000000n,
    } as any);
    await (handler as any).storeTokenTransfer({
      id: "log-transfer-144a-in",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 35,
      transactionIndex: 1,
      block: { height: 21709282, timestamp: 1_700_000_000_800 },
      transactionHash:
        "0xbf10993cf8cbcef7abfdd8708b9dcb5b91bcaff748139bf602929f77d0580980",
    } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "log-dvc-144a",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 36,
      transactionIndex: 1,
      block: { height: 21709282, timestamp: 1_700_000_000_800 },
      transactionHash:
        "0xbf10993cf8cbcef7abfdd8708b9dcb5b91bcaff748139bf602929f77d0580980",
    } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-dc-144a-noop",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 38,
      transactionIndex: 1,
      block: { height: 21709282, timestamp: 1_700_000_000_800 },
      transactionHash:
        "0xbf10993cf8cbcef7abfdd8708b9dcb5b91bcaff748139bf602929f77d0580980",
    } as any);

    expect(
      store.findEntity(
        DelegateMapping,
        "0x8afe3f1f3c0e4361cfff451f0a6a67b540177006",
      ),
    ).toMatchObject({
      to: "0x839395e20bbb182fa440d08f850e6c7a8f6f0780",
      power: 2261028221714870294397n,
    });
    expect(
      store.findEntity(
        DelegateMapping,
        "0x144a042618fb80931f94a6f7daeba00cd200e549",
      ),
    ).toMatchObject({
      to: "0x839395e20bbb182fa440d08f850e6c7a8f6f0780",
      power: 391445859200000000000n,
    });
    expect(
      store.findEntity(
        Delegate,
        "0x8afe3f1f3c0e4361cfff451f0a6a67b540177006_0x839395e20bbb182fa440d08f850e6c7a8f6f0780",
      ),
    ).toMatchObject({
      power: 2261028221714870294397n,
      isCurrent: true,
    });
    expect(
      store.findEntity(
        Delegate,
        "0x144a042618fb80931f94a6f7daeba00cd200e549_0x839395e20bbb182fa440d08f850e6c7a8f6f0780",
      ),
    ).toMatchObject({
      power: 391445859200000000000n,
      isCurrent: true,
    });
  });

  it("does not let a zero-to-delegate transaction-local vote delta override the exact transfer-backed relation", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 0n,
      }),
    ]);
    const handler = buildTokenHandler(store);

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValueOnce({
        delegator: "0xa47080b9dba577b6c53600163cf6747bdbd8bcc5",
        fromDelegate: zeroAddress,
        toDelegate: "0x983110309620d911731ac0932219af06091b6744",
      } as any)
      .mockReturnValueOnce({
        delegator: "0x1860207b3ccb2c318a5ee0f20d20e0a80d68bd74",
        fromDelegate: zeroAddress,
        toDelegate: "0xbdb41bff7e828e2dc2d15eb67257455db818f1dc",
      } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-dc-a470-open",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 80,
      transactionIndex: 1,
      block: { height: 22148285, timestamp: 1_700_000_000_900 },
      transactionHash:
        "0x70ed53d947c70cb98e7a817f9b2533adde3b4fd5f464cda5979cc99c3a5afb92",
    } as any);
    await (handler as any).storeDelegateChanged({
      id: "log-dc-1860-open",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 88,
      transactionIndex: 1,
      block: { height: 22148285, timestamp: 1_700_000_000_900 },
      transactionHash:
        "0x70ed53d947c70cb98e7a817f9b2533adde3b4fd5f464cda5979cc99c3a5afb92",
    } as any);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValueOnce({
      from: "0x51050ec063d393217b436747617ad1c2285aeeee",
      to: "0xa47080b9dba577b6c53600163cf6747bdbd8bcc5",
      value: 400n,
    } as any);
    await (handler as any).storeTokenTransfer({
      id: "log-transfer-a470-in",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 82,
      transactionIndex: 1,
      block: { height: 22148285, timestamp: 1_700_000_000_900 },
      transactionHash:
        "0x70ed53d947c70cb98e7a817f9b2533adde3b4fd5f464cda5979cc99c3a5afb92",
    } as any);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValueOnce({
      from: "0x51050ec063d393217b436747617ad1c2285aeeee",
      to: "0x1860207b3ccb2c318a5ee0f20d20e0a80d68bd74",
      value: 400n,
    } as any);
    await (handler as any).storeTokenTransfer({
      id: "log-transfer-1860-in",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 90,
      transactionIndex: 1,
      block: { height: 22148285, timestamp: 1_700_000_000_900 },
      transactionHash:
        "0x70ed53d947c70cb98e7a817f9b2533adde3b4fd5f464cda5979cc99c3a5afb92",
    } as any);

    jest
      .spyOn(itokenerc20.events.DelegateVotesChanged, "decode")
      .mockReturnValueOnce({
        delegate: "0xbdb41bff7e828e2dc2d15eb67257455db818f1dc",
        previousVotes: 38569978041314116254037n,
        newVotes: 38169978041314116254037n,
      } as any)
      .mockReturnValueOnce({
        delegate: "0x983110309620d911731ac0932219af06091b6744",
        previousVotes: 108433568266913874152377n,
        newVotes: 108833568266913874152377n,
      } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "log-dvc-bdb41",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 83,
      transactionIndex: 1,
      block: { height: 22148285, timestamp: 1_700_000_000_900 },
      transactionHash:
        "0x70ed53d947c70cb98e7a817f9b2533adde3b4fd5f464cda5979cc99c3a5afb92",
    } as any);
    await (handler as any).storeDelegateVotesChanged({
      id: "log-dvc-983",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 84,
      transactionIndex: 1,
      block: { height: 22148285, timestamp: 1_700_000_000_900 },
      transactionHash:
        "0x70ed53d947c70cb98e7a817f9b2533adde3b4fd5f464cda5979cc99c3a5afb92",
    } as any);

    expect(
      store.findEntity(
        DelegateMapping,
        "0x1860207b3ccb2c318a5ee0f20d20e0a80d68bd74",
      ),
    ).toMatchObject({
      to: "0xbdb41bff7e828e2dc2d15eb67257455db818f1dc",
      power: 400n,
    });
    expect(
      store.findEntity(
        Delegate,
        "0x1860207b3ccb2c318a5ee0f20d20e0a80d68bd74_0xbdb41bff7e828e2dc2d15eb67257455db818f1dc",
      ),
    ).toMatchObject({
      power: 400n,
      isCurrent: true,
    });
    expect(
      store.findEntity(
        DelegateMapping,
        "0xa47080b9dba577b6c53600163cf6747bdbd8bcc5",
      ),
    ).toMatchObject({
      to: "0x983110309620d911731ac0932219af06091b6744",
      power: 400n,
    });
  });

  it("does not subtract another delegator's same-tx vote delta from a transfer-backed relation", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 0n,
      }),
    ]);
    const handler = buildTokenHandler(store);

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValueOnce({
        delegator: "0x9de403ef57b032afa295fefc65057365efefd3c3",
        fromDelegate: zeroAddress,
        toDelegate: "0x1f3d3a7a9c548be39539b39d7400302753e20591",
      } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-dc-9de4-open",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 397,
      transactionIndex: 1,
      block: { height: 21297950, timestamp: 1_700_000_001_000 },
      transactionHash:
        "0x632305bd11c1136a2b2953e1fc41ebda1b170eb37eb53fb2f41293ecc6b8625d",
    } as any);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValueOnce({
      from: "0x73cd8626b3cd47b009e68380720cfe6679a3ec3d",
      to: "0x9de403ef57b032afa295fefc65057365efefd3c3",
      value: 15000000000000000000000n,
    } as any);
    await (handler as any).storeTokenTransfer({
      id: "log-transfer-9de4-in",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 398,
      transactionIndex: 1,
      block: { height: 21297950, timestamp: 1_700_000_001_000 },
      transactionHash:
        "0x632305bd11c1136a2b2953e1fc41ebda1b170eb37eb53fb2f41293ecc6b8625d",
    } as any);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValueOnce({
      from: "0x04b05bd584a414cd87796e2c536b4161e5a3ca0a",
      to: "0x000ee9a6bcec9aadcc883bd52b2c9a75fb098991",
      value: 519953196347027812164n,
    } as any);
    await (handler as any).storeTokenTransfer({
      id: "log-transfer-04b05-out",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 401,
      transactionIndex: 1,
      block: { height: 21297950, timestamp: 1_700_000_001_000 },
      transactionHash:
        "0x632305bd11c1136a2b2953e1fc41ebda1b170eb37eb53fb2f41293ecc6b8625d",
    } as any);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValueOnce({
      from: "0x9de403ef57b032afa295fefc65057365efefd3c3",
      to: "0x000ee9a6bcec9aadcc883bd52b2c9a75fb098991",
      value: 4842414145738195837622n,
    } as any);
    await (handler as any).storeTokenTransfer({
      id: "log-transfer-9de4-out",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 403,
      transactionIndex: 1,
      block: { height: 21297950, timestamp: 1_700_000_001_000 },
      transactionHash:
        "0x632305bd11c1136a2b2953e1fc41ebda1b170eb37eb53fb2f41293ecc6b8625d",
    } as any);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValueOnce({
      from: "0x000ee9a6bcec9aadcc883bd52b2c9a75fb098991",
      to: "0x53fa6d5428f16e4e8b67ff29b5c95aa53239c653",
      value: 5300000000000000000000n,
    } as any);
    await (handler as any).storeTokenTransfer({
      id: "log-transfer-000ee9-out",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 405,
      transactionIndex: 1,
      block: { height: 21297950, timestamp: 1_700_000_001_000 },
      transactionHash:
        "0x632305bd11c1136a2b2953e1fc41ebda1b170eb37eb53fb2f41293ecc6b8625d",
    } as any);

    jest
      .spyOn(itokenerc20.events.DelegateVotesChanged, "decode")
      .mockReturnValueOnce({
        delegate: "0x1f3d3a7a9c548be39539b39d7400302753e20591",
        previousVotes: 5032302606544916775545n,
        newVotes: 20032302606544916775545n,
      } as any)
      .mockReturnValueOnce({
        delegate: "0x1f3d3a7a9c548be39539b39d7400302753e20591",
        previousVotes: 20032302606544916775545n,
        newVotes: 14732302606544916775545n,
      } as any)
      .mockReturnValueOnce({
        delegate: "0xd4a46a9ef66d7352790f131fe49e7cf84ae68b55",
        previousVotes: 0n,
        newVotes: 5300000000000000000000n,
      } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "log-dvc-1f3d-plus",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 399,
      transactionIndex: 1,
      block: { height: 21297950, timestamp: 1_700_000_001_000 },
      transactionHash:
        "0x632305bd11c1136a2b2953e1fc41ebda1b170eb37eb53fb2f41293ecc6b8625d",
    } as any);
    await (handler as any).storeDelegateVotesChanged({
      id: "log-dvc-1f3d-minus-other-delegator",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 406,
      transactionIndex: 1,
      block: { height: 21297950, timestamp: 1_700_000_001_000 },
      transactionHash:
        "0x632305bd11c1136a2b2953e1fc41ebda1b170eb37eb53fb2f41293ecc6b8625d",
    } as any);
    await (handler as any).storeDelegateVotesChanged({
      id: "log-dvc-d4a46",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 407,
      transactionIndex: 1,
      block: { height: 21297950, timestamp: 1_700_000_001_000 },
      transactionHash:
        "0x632305bd11c1136a2b2953e1fc41ebda1b170eb37eb53fb2f41293ecc6b8625d",
    } as any);

    expect(
      store.findEntity(
        DelegateMapping,
        "0x9de403ef57b032afa295fefc65057365efefd3c3",
      ),
    ).toMatchObject({
      to: "0x1f3d3a7a9c548be39539b39d7400302753e20591",
      power: 10157585854261804162378n,
    });
    expect(
      store.findEntity(
        Delegate,
        "0x9de403ef57b032afa295fefc65057365efefd3c3_0x1f3d3a7a9c548be39539b39d7400302753e20591",
      ),
    ).toMatchObject({
      power: 10157585854261804162378n,
      isCurrent: true,
    });
  });

  it("does not leave transfer-only power behind after a redelegation plus same-tx incoming transfer", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 0n,
      }),
    ]);
    const handler = buildTokenHandler(store);

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValueOnce({
        delegator: "0xaed1d7179eed5ae3272ad3992edddb2fe06ca2d3",
        fromDelegate: zeroAddress,
        toDelegate: "0x54becc7560a7be76d72ed76a1f5fee6c5a2a7ab6",
      } as any)
      .mockReturnValueOnce({
        delegator: "0xaed1d7179eed5ae3272ad3992edddb2fe06ca2d3",
        fromDelegate: "0x54becc7560a7be76d72ed76a1f5fee6c5a2a7ab6",
        toDelegate: "0xbdb41bff7e828e2dc2d15eb67257455db818f1dc",
      } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-dc-open-old-delegate",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 10,
      transactionIndex: 1,
      block: { height: 13854700, timestamp: 1_700_000_001_100 },
      transactionHash:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-dc-redelegate-with-transfer",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 332,
      transactionIndex: 2,
      block: { height: 13854740, timestamp: 1_700_000_001_200 },
      transactionHash:
        "0x17e67e25f9a26c81ab3c34cbc57d3c1519d8700d2a7220727a061b9b095da914",
    } as any);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValueOnce({
      from: "0xc18360217d8f7ab5e7c516566761ea12ce7f9d72",
      to: "0xaed1d7179eed5ae3272ad3992edddb2fe06ca2d3",
      value: 67139940657624678400n,
    } as any);
    await (handler as any).storeTokenTransfer({
      id: "log-transfer-in",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 333,
      transactionIndex: 2,
      block: { height: 13854740, timestamp: 1_700_000_001_200 },
      transactionHash:
        "0x17e67e25f9a26c81ab3c34cbc57d3c1519d8700d2a7220727a061b9b095da914",
    } as any);

    jest
      .spyOn(itokenerc20.events.DelegateVotesChanged, "decode")
      .mockReturnValueOnce({
        delegate: "0xbdb41bff7e828e2dc2d15eb67257455db818f1dc",
        previousVotes: 163805588179598136757454n,
        newVotes: 163872728120255761435854n,
      } as any)
      .mockReturnValueOnce({
        delegate: "0xbdb41bff7e828e2dc2d15eb67257455db818f1dc",
        previousVotes: 163872728120255761435854n,
        newVotes: 163805588179598136757454n,
      } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "log-dvc-redelegate-plus-transfer",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 334,
      transactionIndex: 2,
      block: { height: 13854740, timestamp: 1_700_000_001_200 },
      transactionHash:
        "0x17e67e25f9a26c81ab3c34cbc57d3c1519d8700d2a7220727a061b9b095da914",
    } as any);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValueOnce({
      from: "0xaed1d7179eed5ae3272ad3992edddb2fe06ca2d3",
      to: "0x92560c178ce069cc014138ed3c2f5221ba71f58a",
      value: 67139940657624678400n,
    } as any);
    await (handler as any).storeTokenTransfer({
      id: "log-transfer-out",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 180,
      transactionIndex: 3,
      block: { height: 13855331, timestamp: 1_700_000_001_300 },
      transactionHash:
        "0xc4dbac633d12c9014766ae1c70faa4a0bef3faa3e823d7d572ebcb7531c52908",
    } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "log-dvc-transfer-out",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 181,
      transactionIndex: 3,
      block: { height: 13855331, timestamp: 1_700_000_001_300 },
      transactionHash:
        "0xc4dbac633d12c9014766ae1c70faa4a0bef3faa3e823d7d572ebcb7531c52908",
    } as any);

    expect(
      store.findEntity(
        DelegateMapping,
        "0xaed1d7179eed5ae3272ad3992edddb2fe06ca2d3",
      ),
    ).toMatchObject({
      to: "0xbdb41bff7e828e2dc2d15eb67257455db818f1dc",
      power: 0n,
    });
    expect(
      store.findEntity(
        Delegate,
        "0xaed1d7179eed5ae3272ad3992edddb2fe06ca2d3_0xbdb41bff7e828e2dc2d15eb67257455db818f1dc",
      ),
    ).toMatchObject({
      power: 0n,
      isCurrent: true,
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

  it("updates contributor aggregates from the final synchronized relation delta", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 40n,
      }),
      new Contributor({
        id: "0x1111111111111111111111111111111111111111",
        power: 40n,
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
        power: 40n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new DelegateMapping({
        id: "0x2222222222222222222222222222222222222222",
        from: "0x2222222222222222222222222222222222222222",
        to: "0x1111111111111111111111111111111111111111",
        power: 50n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
    ]);
    const handler = buildTokenHandler(store);

    await (handler as any).storeDelegate(
      new Delegate({
        id: "0x2222222222222222222222222222222222222222_0x1111111111111111111111111111111111111111",
        chainId: 1,
        daoCode: "demo",
        governorAddress: "0x9999999999999999999999999999999999999999",
        tokenAddress: "0x8888888888888888888888888888888888888888",
        contractAddress: "0x8888888888888888888888888888888888888888",
        logIndex: 2,
        transactionIndex: 1,
        fromDelegate: "0x2222222222222222222222222222222222222222",
        toDelegate: "0x1111111111111111111111111111111111111111",
        blockNumber: 2n,
        blockTimestamp: 2n,
        transactionHash: "0xsync-current-relation",
        power: 0n,
      }),
    );

    expect(
      store.findEntity(
        Delegate,
        "0x2222222222222222222222222222222222222222_0x1111111111111111111111111111111111111111",
      ),
    ).toMatchObject({
      power: 50n,
      isCurrent: true,
    });
    expect(
      store.findEntity(Contributor, "0x1111111111111111111111111111111111111111"),
    ).toMatchObject({
      power: 50n,
      delegatesCountEffective: 1,
    });
    expect(store.findEntity(DataMetric, "global")?.powerSum).toBe(50n);
  });

  it("matches same-tx zero-to-old and old-to-new vote deltas by delta sign", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 0n,
      }),
    ]);
    const handler = buildTokenHandler(store);
    const txHash =
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValueOnce({
        delegator: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        fromDelegate: zeroAddress,
        toDelegate: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      } as any)
      .mockReturnValueOnce({
        delegator: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        fromDelegate: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        toDelegate: "0xcccccccccccccccccccccccccccccccccccccccc",
      } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-dc-open-old",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 1,
      transactionIndex: 1,
      block: { height: 100, timestamp: 1_700_000_001_000 },
      transactionHash: txHash,
    } as any);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValueOnce({
      from: "0xdddddddddddddddddddddddddddddddddddddddd",
      to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      value: 4000n,
    } as any);
    await (handler as any).storeTokenTransfer({
      id: "log-transfer-in",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 2,
      transactionIndex: 1,
      block: { height: 100, timestamp: 1_700_000_001_000 },
      transactionHash: txHash,
    } as any);

    await (handler as any).storeDelegateChanged({
      id: "log-dc-redelegate",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 3,
      transactionIndex: 1,
      block: { height: 100, timestamp: 1_700_000_001_000 },
      transactionHash: txHash,
    } as any);

    jest
      .spyOn(itokenerc20.events.DelegateVotesChanged, "decode")
      .mockReturnValueOnce({
        delegate: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        previousVotes: 0n,
        newVotes: 4000n,
      } as any)
      .mockReturnValueOnce({
        delegate: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        previousVotes: 4000n,
        newVotes: 0n,
      } as any)
      .mockReturnValueOnce({
        delegate: "0xcccccccccccccccccccccccccccccccccccccccc",
        previousVotes: 0n,
        newVotes: 4000n,
      } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "log-dvc-old-plus",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 4,
      transactionIndex: 1,
      block: { height: 100, timestamp: 1_700_000_001_000 },
      transactionHash: txHash,
    } as any);
    await (handler as any).storeDelegateVotesChanged({
      id: "log-dvc-old-minus",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 5,
      transactionIndex: 1,
      block: { height: 100, timestamp: 1_700_000_001_000 },
      transactionHash: txHash,
    } as any);
    await (handler as any).storeDelegateVotesChanged({
      id: "log-dvc-new-plus",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 6,
      transactionIndex: 1,
      block: { height: 100, timestamp: 1_700_000_001_000 },
      transactionHash: txHash,
    } as any);

    expect(
      store.findEntity(
        DelegateMapping,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).toMatchObject({
      to: "0xcccccccccccccccccccccccccccccccccccccccc",
      power: 4000n,
    });
    expect(
      store.findEntity(
        Delegate,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ),
    ).toMatchObject({
      power: 0n,
      isCurrent: false,
    });
    expect(
      store.findEntity(
        Delegate,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_0xcccccccccccccccccccccccccccccccccccccccc",
      ),
    ).toMatchObject({
      power: 4000n,
      isCurrent: true,
    });
    expect(
      store.findEntity(Contributor, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
    ).toMatchObject({
      power: 0n,
    });
    expect(
      store.findEntity(Contributor, "0xcccccccccccccccccccccccccccccccccccccccc"),
    ).toMatchObject({
      power: 4000n,
    });
  });

  it("keeps the second leg of a transfer-backed chained redelegation when logs are processed in order", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 0n,
      }),
    ]);
    const handler = buildTokenHandler(store);
    const txHash =
      "0x1111111111111111111111111111111111111111111111111111111111111111";

    jest
      .spyOn(itokenerc20.events.DelegateChanged, "decode")
      .mockReturnValueOnce({
        delegator: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        fromDelegate: zeroAddress,
        toDelegate: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      } as any)
      .mockReturnValueOnce({
        delegator: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        fromDelegate: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        toDelegate: "0xcccccccccccccccccccccccccccccccccccccccc",
      } as any);

    await (handler as any).storeDelegateChanged({
      id: "ordered-dc-open-old",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 1,
      transactionIndex: 1,
      block: { height: 100, timestamp: 1_700_000_001_000 },
      transactionHash: txHash,
    } as any);

    jest.spyOn(itokenerc20.events.Transfer, "decode").mockReturnValueOnce({
      from: "0xdddddddddddddddddddddddddddddddddddddddd",
      to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      value: 4000n,
    } as any);
    await (handler as any).storeTokenTransfer({
      id: "ordered-transfer-in",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 2,
      transactionIndex: 1,
      block: { height: 100, timestamp: 1_700_000_001_000 },
      transactionHash: txHash,
    } as any);

    await (handler as any).storeDelegateChanged({
      id: "ordered-dc-redelegate",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 3,
      transactionIndex: 1,
      block: { height: 100, timestamp: 1_700_000_001_000 },
      transactionHash: txHash,
    } as any);

    jest
      .spyOn(itokenerc20.events.DelegateVotesChanged, "decode")
      .mockReturnValueOnce({
        delegate: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        previousVotes: 0n,
        newVotes: 4000n,
      } as any)
      .mockReturnValueOnce({
        delegate: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        previousVotes: 4000n,
        newVotes: 0n,
      } as any)
      .mockReturnValueOnce({
        delegate: "0xcccccccccccccccccccccccccccccccccccccccc",
        previousVotes: 0n,
        newVotes: 4000n,
      } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "ordered-dvc-old-plus",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 4,
      transactionIndex: 1,
      block: { height: 100, timestamp: 1_700_000_001_000 },
      transactionHash: txHash,
    } as any);
    await (handler as any).storeDelegateVotesChanged({
      id: "ordered-dvc-old-minus",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 5,
      transactionIndex: 1,
      block: { height: 100, timestamp: 1_700_000_001_000 },
      transactionHash: txHash,
    } as any);
    await (handler as any).storeDelegateVotesChanged({
      id: "ordered-dvc-new-plus",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 6,
      transactionIndex: 1,
      block: { height: 100, timestamp: 1_700_000_001_000 },
      transactionHash: txHash,
    } as any);

    expect(
      store.findEntity(
        DelegateMapping,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).toMatchObject({
      to: "0xcccccccccccccccccccccccccccccccccccccccc",
      power: 4000n,
    });
    expect(
      store.findEntity(
        Delegate,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ),
    ).toMatchObject({
      power: 0n,
      isCurrent: false,
    });
    expect(
      store.findEntity(
        Delegate,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_0xcccccccccccccccccccccccccccccccccccccccc",
      ),
    ).toMatchObject({
      power: 4000n,
      isCurrent: true,
    });
    expect(
      store.findEntity(Contributor, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
    ).toMatchObject({
      power: 0n,
    });
    expect(
      store.findEntity(Contributor, "0xcccccccccccccccccccccccccccccccccccccccc"),
    ).toMatchObject({
      power: 4000n,
    });
  });

  it("does not subtract same-tx incoming transfer from a redelegation when the old delegate has a vote delta first", async () => {
    const store = new MemoryStore([
      new DataMetric({
        id: "global",
        powerSum: 5970n,
      }),
      new Contributor({
        id: "0x1111111111111111111111111111111111111111",
        power: 5970n,
        delegatesCountAll: 1,
        delegatesCountEffective: 1,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new Delegate({
        id: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_0x1111111111111111111111111111111111111111",
        fromDelegate: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        toDelegate: "0x1111111111111111111111111111111111111111",
        isCurrent: true,
        power: 5970n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
      new DelegateMapping({
        id: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        from: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        to: "0x1111111111111111111111111111111111111111",
        power: 5970n,
        blockNumber: 1n,
        blockTimestamp: 1n,
        transactionHash: "0xseed",
      }),
    ]);
    const handler = buildTokenHandler(store);
    const txHash =
      "0x2222222222222222222222222222222222222222222222222222222222222222";

    jest.spyOn(itokenerc20.events.Transfer, "decode")
      .mockReturnValueOnce({
        from: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        value: 823n,
      } as any)
      .mockReturnValueOnce({
        from: "0xcccccccccccccccccccccccccccccccccccccccc",
        to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        value: 2058n,
      } as any);

    await (handler as any).storeTokenTransfer({
      id: "redelegate-transfer-1",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 1,
      transactionIndex: 1,
      block: { height: 100, timestamp: 1_700_000_001_000 },
      transactionHash: txHash,
    } as any);
    await (handler as any).storeTokenTransfer({
      id: "redelegate-transfer-2",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 2,
      transactionIndex: 1,
      block: { height: 100, timestamp: 1_700_000_001_000 },
      transactionHash: txHash,
    } as any);

    jest.spyOn(itokenerc20.events.DelegateChanged, "decode").mockReturnValueOnce({
      delegator: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      fromDelegate: "0x1111111111111111111111111111111111111111",
      toDelegate: "0x2222222222222222222222222222222222222222",
    } as any);

    await (handler as any).storeDelegateChanged({
      id: "redelegate-change",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 3,
      transactionIndex: 1,
      block: { height: 100, timestamp: 1_700_000_001_000 },
      transactionHash: txHash,
    } as any);

    jest.spyOn(itokenerc20.events.DelegateVotesChanged, "decode")
      .mockReturnValueOnce({
        delegate: "0x1111111111111111111111111111111111111111",
        previousVotes: 14731n,
        newVotes: 5880n,
      } as any)
      .mockReturnValueOnce({
        delegate: "0x2222222222222222222222222222222222222222",
        previousVotes: 3155n,
        newVotes: 12006n,
      } as any);

    await (handler as any).storeDelegateVotesChanged({
      id: "redelegate-old-minus",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 4,
      transactionIndex: 1,
      block: { height: 100, timestamp: 1_700_000_001_000 },
      transactionHash: txHash,
    } as any);
    await (handler as any).storeDelegateVotesChanged({
      id: "redelegate-new-plus",
      address: "0x8888888888888888888888888888888888888888",
      logIndex: 5,
      transactionIndex: 1,
      block: { height: 100, timestamp: 1_700_000_001_000 },
      transactionHash: txHash,
    } as any);

    expect(
      store.findEntity(
        DelegateMapping,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).toMatchObject({
      to: "0x2222222222222222222222222222222222222222",
      power: 8851n,
    });
    expect(
      store.findEntity(
        Delegate,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_0x2222222222222222222222222222222222222222",
      ),
    ).toMatchObject({
      power: 8851n,
      isCurrent: true,
    });
    expect(
      store.findEntity(
        Delegate,
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_0x1111111111111111111111111111111111111111",
      ),
    ).toMatchObject({
      power: 0n,
      isCurrent: false,
    });
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

  async find(entity: any, options: { where: Record<string, unknown> }) {
    const values = [...(this.records.get(entity.name)?.values() ?? [])];
    return values.filter((record) =>
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
