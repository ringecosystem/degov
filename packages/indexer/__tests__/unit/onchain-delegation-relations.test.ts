import { TokenHandler } from "../../src/handler/token";
import * as itokenerc20 from "../../src/abi/itokenerc20";
import {
  Contributor,
  DataMetric,
  Delegate,
  DelegateChanged,
  DelegateMapping,
  DelegateRolling,
  DelegateVotesChanged,
  OnchainRefreshTask,
  TokenTransfer,
  VotePowerCheckpoint,
} from "../../src/model";
import { ChainTool } from "../../src/internal/chaintool";

const tokenAddress = "0x8888888888888888888888888888888888888888";
const governorAddress = "0x9999999999999999999999999999999999999999";
const delegator = "0x1111111111111111111111111111111111111111";
const delegatee = "0x2222222222222222222222222222222222222222";
const zeroAddress = "0x0000000000000000000000000000000000000000";

describe("onchain delegation relations", () => {
  const previousPowerSource = process.env.DEGOV_INDEXER_POWER_SOURCE;
  const previousEventReads = process.env.DEGOV_INDEXER_ONCHAIN_EVENT_READS_ENABLED;

  afterEach(() => {
    restoreEnv("DEGOV_INDEXER_POWER_SOURCE", previousPowerSource);
    restoreEnv("DEGOV_INDEXER_ONCHAIN_EVENT_READS_ENABLED", previousEventReads);
  });

  it("keeps delegate mappings and relation power when onchain reads are deferred", async () => {
    process.env.DEGOV_INDEXER_POWER_SOURCE = "onchain";
    process.env.DEGOV_INDEXER_ONCHAIN_EVENT_READS_ENABLED = "false";
    const store = createMemoryStore();
    const handler = new TokenHandler(
      {
        store: store as any,
        log: {
          warn: jest.fn(),
          info: jest.fn(),
          debug: jest.fn(),
        },
      } as any,
      {
        chainId: 1135,
        rpcs: ["https://rpc.example"],
        work: {
          daoCode: "lisk-dao",
          contracts: [
            { name: "governor", address: governorAddress },
            { name: "governorToken", address: tokenAddress, standard: "erc20" },
          ],
        },
        indexContract: {
          name: "governorToken",
          address: tokenAddress,
          standard: "erc20",
        },
        chainTool: new ChainTool(),
      },
    );

    await handler.handle(delegateChangedLog({
      id: "delegate-change-1",
      delegator,
      fromDelegate: zeroAddress,
      toDelegate: delegatee,
      logIndex: 1,
    }) as any);
    await handler.handle(delegateVotesChangedLog({
      id: "delegate-votes-1",
      delegate: delegatee,
      previousVotes: 0n,
      newVotes: 100n,
      logIndex: 2,
    }) as any);
    await handler.flush();

    expect(store.entities(DelegateChanged)).toHaveLength(1);
    expect(store.entities(DelegateVotesChanged)).toHaveLength(1);
    expect(store.entities(OnchainRefreshTask)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          account: delegator,
          refreshBalance: true,
          refreshPower: false,
          status: "pending",
        }),
        expect.objectContaining({
          account: delegatee,
          refreshBalance: false,
          refreshPower: true,
          status: "pending",
        }),
      ]),
    );
    expect(store.entities(DelegateMapping)).toEqual([
      expect.objectContaining({
        id: delegator,
        from: delegator,
        to: delegatee,
        power: 100n,
      }),
    ]);
    expect(store.entities(Delegate)).toEqual([
      expect.objectContaining({
        id: `${delegator}_${delegatee}`,
        fromDelegate: delegator,
        toDelegate: delegatee,
        power: 100n,
        isCurrent: true,
      }),
    ]);
    expect(store.entities(VotePowerCheckpoint)).toHaveLength(0);
    expect(store.entities(Contributor)).toEqual([
      expect.objectContaining({
        id: delegatee,
        power: 0n,
        delegatesCountAll: 1,
        delegatesCountEffective: 1,
      }),
    ]);
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function createMemoryStore() {
  const records = new Map<Function, any[]>();
  const list = (entity: Function) => records.get(entity) ?? [];
  const upsert = (entity: Function, value: any) => {
    const items = list(entity);
    const id = value?.id;
    records.set(entity, id === undefined ? [...items, value] : [...items.filter((item) => item.id !== id), value]);
  };

  return {
    entities: (entity: Function) => list(entity),
    insert: jest.fn(async (entityOrEntities: any) => {
      const entities = Array.isArray(entityOrEntities) ? entityOrEntities : [entityOrEntities];
      for (const entity of entities) {
        upsert(entity.constructor, entity);
      }
    }),
    save: jest.fn(async (entityOrEntities: any) => {
      const entities = Array.isArray(entityOrEntities) ? entityOrEntities : [entityOrEntities];
      for (const entity of entities) {
        upsert(entity.constructor, entity);
      }
    }),
    remove: jest.fn(async (entity: Function, id: string) => {
      records.set(entity, list(entity).filter((item) => item.id !== id));
    }),
    findOne: jest.fn(async (entity: Function, options: any) => {
      const where = options?.where ?? {};
      return list(entity).find((item) =>
        Object.entries(where).every(([key, value]) => item[key] === value),
      );
    }),
    find: jest.fn(async (entity: Function, options: any) => {
      const where = options?.where ?? {};
      return list(entity).filter((item) =>
        Object.entries(where).every(([key, value]) => item[key] === value),
      );
    }),
  };
}

function delegateChangedLog(options: {
  id: string;
  delegator: string;
  fromDelegate: string;
  toDelegate: string;
  logIndex: number;
}) {
  return baseLog({
    id: options.id,
    logIndex: options.logIndex,
    topics: [
      itokenerc20.events.DelegateChanged.topic,
      topicAddress(options.delegator),
      topicAddress(options.fromDelegate),
      topicAddress(options.toDelegate),
    ],
    data: "0x",
  });
}

function delegateVotesChangedLog(options: {
  id: string;
  delegate: string;
  previousVotes: bigint;
  newVotes: bigint;
  logIndex: number;
}) {
  return baseLog({
    id: options.id,
    logIndex: options.logIndex,
    topics: [itokenerc20.events.DelegateVotesChanged.topic, topicAddress(options.delegate)],
    data: `0x${uint256(options.previousVotes)}${uint256(options.newVotes)}`,
  });
}

function baseLog(options: {
  id: string;
  logIndex: number;
  topics: string[];
  data: string;
}) {
  return {
    id: options.id,
    address: tokenAddress,
    topics: options.topics,
    data: options.data,
    logIndex: options.logIndex,
    transactionIndex: 0,
    transactionHash: "0xtx",
    block: {
      height: 100,
      timestamp: 1_700_000_000_000,
    },
  };
}

function topicAddress(address: string) {
  return `0x${address.slice(2).padStart(64, "0")}`;
}

function uint256(value: bigint) {
  return value.toString(16).padStart(64, "0");
}
