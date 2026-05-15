import { processOnchainRefreshBatch } from "../../src/onchain-refresh/worker";
import { ChainTool } from "../../src/internal/chaintool";

const multicall = jest.fn();

jest.mock("viem", () => {
  const actual = jest.requireActual("viem");
  return {
    ...actual,
    createPublicClient: jest.fn(() => ({ multicall })),
  };
});

describe("onchain refresh worker", () => {
  beforeEach(() => {
    multicall.mockReset();
  });

  it("updates contributor state before marking locked tasks processed", async () => {
    const governorAddress = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
    const tokenAddress = "0xBbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBb";
    const queries: { sql: string; params?: unknown[] }[] = [];
    const dataSource = {
      transaction: async (callback: any) => callback(dataSource),
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes("FOR UPDATE SKIP LOCKED")) {
          return [
            {
              id: "task-1",
              chainId: 1,
              daoCode: "demo",
              governorAddress: governorAddress.toLowerCase(),
              tokenAddress: tokenAddress.toLowerCase(),
              account: "0x1111111111111111111111111111111111111111",
              refreshBalance: true,
              refreshPower: true,
              attempts: 0,
            },
          ];
        }
        if (sql.includes("FROM contributor")) {
          return [{ power: "3", balance: "2" }];
        }
        return [];
      }),
    };
    const chainTool = new ChainTool();
    jest.spyOn(chainTool, "latestBlock").mockResolvedValue({
      number: 123n,
      timestampMs: 1_700_000_000_000n,
    });
    jest.spyOn(chainTool, "tokenBalance").mockResolvedValue(9n);
    jest.spyOn(chainTool, "currentVotesWithSource").mockResolvedValue({
      method: "getVotes",
      votes: 7n,
    });

    const result = await processOnchainRefreshBatch(dataSource as any, chainTool, {
      chainId: 1,
      daoCode: "demo",
      governorAddress,
      tokenAddress,
      rpcs: ["https://rpc.example"],
      workerId: "worker-1",
      batchSize: 10,
      now: 1_700_000_000_000n,
    });

    expect(result).toEqual({ claimed: 1, processed: 1, failed: 0 });
    expect(chainTool.tokenBalance).toHaveBeenCalledWith(
      expect.objectContaining({
        account: "0x1111111111111111111111111111111111111111",
        blockNumber: 123n,
      }),
    );
    expect(chainTool.currentVotesWithSource).toHaveBeenCalledWith(
      expect.objectContaining({
        account: "0x1111111111111111111111111111111111111111",
        blockNumber: 123n,
      }),
    );
    const updateContributorIndex = queries.findIndex((entry) =>
      entry.sql.includes("INSERT INTO contributor"),
    );
    const contributorInsert = queries[updateContributorIndex];
    expect(contributorInsert.params).toEqual(
      expect.arrayContaining([governorAddress.toLowerCase(), tokenAddress.toLowerCase()]),
    );
    const markProcessedIndex = queries.findIndex((entry) =>
      entry.sql.includes("ELSE 'processed'"),
    );
    expect(updateContributorIndex).toBeGreaterThan(-1);
    expect(markProcessedIndex).toBeGreaterThan(updateContributorIndex);
    const claimTasks = queries.find((entry) =>
      entry.sql.includes("FOR UPDATE SKIP LOCKED"),
    );
    expect(claimTasks?.sql).toContain("status = 'processing'");
    expect(claimTasks?.sql).toContain("locked_at <= $5");
    expect(claimTasks?.params).toEqual([
      1,
      governorAddress,
      tokenAddress,
      "1700000000000",
      "1699999700000",
      10,
    ]);
  });

  it("requeues successfully processed tasks when events arrived while locked", async () => {
    const queries: { sql: string; params?: unknown[] }[] = [];
    const dataSource = {
      transaction: async (callback: any) => callback(dataSource),
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes("FOR UPDATE SKIP LOCKED")) {
          return [
            {
              id: "task-1",
              chainId: 1,
              daoCode: "demo",
              governorAddress: "0x9999999999999999999999999999999999999999",
              tokenAddress: "0x8888888888888888888888888888888888888888",
              account: "0x1111111111111111111111111111111111111111",
              refreshBalance: true,
              refreshPower: true,
              attempts: 0,
            },
          ];
        }
        if (sql.includes("FROM contributor")) {
          return [{ power: "3", balance: "2" }];
        }
        return [];
      }),
    };
    const chainTool = new ChainTool();
    jest.spyOn(chainTool, "latestBlock").mockResolvedValue({
      number: 123n,
      timestampMs: 1_700_000_000_000n,
    });
    jest.spyOn(chainTool, "tokenBalance").mockResolvedValue(9n);
    jest.spyOn(chainTool, "currentVotesWithSource").mockResolvedValue({
      method: "getVotes",
      votes: 7n,
    });

    const result = await processOnchainRefreshBatch(dataSource as any, chainTool, {
      chainId: 1,
      daoCode: "demo",
      governorAddress: "0x9999999999999999999999999999999999999999",
      tokenAddress: "0x8888888888888888888888888888888888888888",
      rpcs: ["https://rpc.example"],
      workerId: "worker-1",
      batchSize: 10,
      now: 1_700_000_000_000n,
    });

    expect(result).toEqual({ claimed: 1, processed: 1, failed: 0 });
    const markProcessed = queries.find((entry) =>
      entry.sql.includes("WHEN pending_after_lock THEN 'pending'"),
    );
    expect(markProcessed).toBeDefined();
    expect(markProcessed?.sql).toContain("ELSE 'processed'");
    expect(markProcessed?.sql).toContain("ELSE $1::numeric");
    expect(markProcessed?.sql).toContain("pending_after_lock = false");
    expect(markProcessed?.sql).toContain(
      "pending_after_lock_block_number = NULL",
    );
    expect(markProcessed?.sql).toContain(
      "last_seen_block_number = COALESCE(",
    );
    expect(markProcessed?.params).toEqual([
      "1700000000000",
      ["task-1"],
    ]);
  });

  it("keeps failed tasks retryable instead of marking them processed", async () => {
    const queries: { sql: string; params?: unknown[] }[] = [];
    const dataSource = {
      transaction: async (callback: any) => callback(dataSource),
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes("FOR UPDATE SKIP LOCKED")) {
          return [
            {
              id: "task-1",
              chainId: 1,
              daoCode: "demo",
              governorAddress: "0x9999999999999999999999999999999999999999",
              tokenAddress: "0x8888888888888888888888888888888888888888",
              account: "0x1111111111111111111111111111111111111111",
              refreshBalance: true,
              refreshPower: false,
              attempts: 2,
            },
          ];
        }
        return [];
      }),
    };
    const chainTool = new ChainTool();
    jest.spyOn(chainTool, "latestBlock").mockResolvedValue({
      number: 123n,
      timestampMs: 1_700_000_000_000n,
    });
    jest.spyOn(chainTool, "tokenBalance").mockRejectedValue(new Error("rate limit"));

    const result = await processOnchainRefreshBatch(dataSource as any, chainTool, {
      chainId: 1,
      governorAddress: "0x9999999999999999999999999999999999999999",
      tokenAddress: "0x8888888888888888888888888888888888888888",
      rpcs: ["https://rpc.example"],
      workerId: "worker-1",
      batchSize: 10,
      now: 1_700_000_000_000n,
    });

    expect(result).toEqual({ claimed: 1, processed: 0, failed: 1 });
    expect(
      queries.some((entry) => entry.sql.includes("ELSE 'processed'")),
    ).toBe(false);
    expect(queries.some((entry) => entry.sql.includes("status = 'pending'"))).toBe(
      true,
    );
  });

  it("does not claim tasks while the processor is still far behind the chain head without reconcile seeding", async () => {
    const queries: { sql: string; params?: unknown[] }[] = [];
    const dataSource = {
      transaction: async (callback: any) => callback(dataSource),
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes('"squid_processor".status')) {
          return [{ height: "100" }];
        }
        if (sql.includes("FOR UPDATE SKIP LOCKED")) {
          return [
            {
              id: "task-1",
              chainId: 1,
              governorAddress: "0x9999999999999999999999999999999999999999",
              tokenAddress: "0x8888888888888888888888888888888888888888",
              account: "0x1111111111111111111111111111111111111111",
              refreshBalance: true,
              refreshPower: true,
              attempts: 0,
            },
          ];
        }
        return [];
      }),
    };
    const chainTool = new ChainTool();
    jest.spyOn(chainTool, "latestBlock").mockResolvedValue({
      number: 200n,
      timestampMs: 1_700_000_000_000n,
    });

    const result = await processOnchainRefreshBatch(dataSource as any, chainTool, {
      chainId: 1,
      governorAddress: "0x9999999999999999999999999999999999999999",
      tokenAddress: "0x8888888888888888888888888888888888888888",
      rpcs: ["https://rpc.example"],
      workerId: "worker-1",
      batchSize: 10,
      maxSyncLagBlocks: 50,
      seedReconcile: false,
      now: 1_700_000_000_000n,
    });

    expect(result).toEqual({
      claimed: 0,
      processed: 0,
      failed: 0,
      skipped: "sync-lag",
      syncLagBlocks: "100",
    });
    expect(
      queries.some((entry) => entry.sql.includes("FOR UPDATE SKIP LOCKED")),
    ).toBe(false);
    expect(
      queries.some((entry) => entry.sql.includes("INSERT INTO onchain_refresh_task")),
    ).toBe(false);
  });

  it("seeds and claims only reconcile tasks while the processor is still far behind the chain head", async () => {
    const account = "0x1111111111111111111111111111111111111111";
    const queries: { sql: string; params?: unknown[] }[] = [];
    const dataSource = {
      transaction: async (callback: any) => callback(dataSource),
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes('"squid_processor".status')) {
          return [{ height: "100" }];
        }
        if (sql.includes("known_accounts")) {
          return [{ account }];
        }
        if (
          sql.includes("SELECT lower(account) AS account") &&
          sql.includes("WHERE id = ANY($1::text[])") &&
          sql.includes("FROM onchain_refresh_task")
        ) {
          return [];
        }
        if (sql.includes("FOR UPDATE SKIP LOCKED")) {
          expect(sql).toContain("btrim(reason_item) = 'reconcile'");
          return [
            {
              id: "task-1",
              chainId: 1,
              daoCode: "demo",
              governorAddress: "0x9999999999999999999999999999999999999999",
              tokenAddress: "0x8888888888888888888888888888888888888888",
              account,
              refreshBalance: true,
              refreshPower: true,
              attempts: 0,
            },
          ];
        }
        if (sql.includes("FROM contributor")) {
          return [
            {
              id: account,
              power: "0",
              balance: "0",
              delegatesCountAll: 0,
              delegatesCountEffective: 0,
            },
          ];
        }
        return [];
      }),
    };
    const chainTool = new ChainTool();
    jest.spyOn(chainTool, "latestBlock").mockResolvedValue({
      number: 200n,
      timestampMs: 1_700_000_000_000n,
    });
    jest.spyOn(chainTool, "tokenBalance").mockResolvedValue(9n);
    jest.spyOn(chainTool, "currentVotesWithSource").mockResolvedValue({
      method: "getVotes",
      votes: 7n,
    });

    const result = await processOnchainRefreshBatch(dataSource as any, chainTool, {
      chainId: 1,
      daoCode: "demo",
      governorAddress: "0x9999999999999999999999999999999999999999",
      tokenAddress: "0x8888888888888888888888888888888888888888",
      rpcs: ["https://rpc.example"],
      workerId: "worker-1",
      batchSize: 10,
      maxSyncLagBlocks: 50,
      seedReconcile: true,
      now: 1_700_000_000_000n,
    });

    expect(result).toEqual({
      claimed: 1,
      processed: 1,
      failed: 0,
      seeded: 1,
      syncLagBlocks: "100",
      claimMode: "reconcile-only",
    });
    expect(
      queries.some((entry) => entry.sql.includes("INSERT INTO onchain_refresh_task")),
    ).toBe(true);
    expect(chainTool.tokenBalance).toHaveBeenCalledWith(
      expect.objectContaining({
        account,
        blockNumber: 200n,
      }),
    );
    expect(chainTool.currentVotesWithSource).toHaveBeenCalledWith(
      expect.objectContaining({
        account,
        blockNumber: 200n,
      }),
    );
  });

  it("seeds reconcile tasks after the processor lag guard passes", async () => {
    const account = "0x1111111111111111111111111111111111111111";
    const alreadySeeded = "0x2222222222222222222222222222222222222222";
    const queries: { sql: string; params?: unknown[] }[] = [];
    const dataSource = {
      transaction: async (callback: any) => callback(dataSource),
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes('"squid_processor".status')) {
          return [{ height: "120" }];
        }
        if (sql.includes("known_accounts")) {
          return [{ account }, { account: alreadySeeded }];
        }
        if (
          sql.includes("SELECT lower(account) AS account") &&
          sql.includes("WHERE id = ANY($1::text[])") &&
          sql.includes("FROM onchain_refresh_task")
        ) {
          return [{ account: alreadySeeded }];
        }
        if (sql.includes("FOR UPDATE SKIP LOCKED")) {
          return [];
        }
        return [];
      }),
    };
    const chainTool = new ChainTool();
    jest.spyOn(chainTool, "latestBlock").mockResolvedValue({
      number: 123n,
      timestampMs: 1_700_000_000_000n,
    });
    jest.spyOn(chainTool, "tokenBalance");
    jest.spyOn(chainTool, "currentVotesWithSource");

    const result = await processOnchainRefreshBatch(dataSource as any, chainTool, {
      chainId: 1,
      daoCode: "demo",
      governorAddress: "0x9999999999999999999999999999999999999999",
      tokenAddress: "0x8888888888888888888888888888888888888888",
      rpcs: ["https://rpc.example"],
      workerId: "worker-1",
      batchSize: 10,
      maxSyncLagBlocks: 5,
      seedReconcile: true,
      now: 1_700_000_000_000n,
    });

    expect(result).toEqual({
      claimed: 0,
      processed: 0,
      failed: 0,
      seeded: 1,
    });
    expect(chainTool.tokenBalance).not.toHaveBeenCalled();
    expect(chainTool.currentVotesWithSource).not.toHaveBeenCalled();
    const taskInsert = queries.find((entry) =>
      entry.sql.includes("INSERT INTO onchain_refresh_task"),
    );
    expect(taskInsert?.sql).toContain("FROM unnest($8::text[], $9::text[])");
    expect(taskInsert?.params).toEqual([
      1,
      "demo",
      "0x9999999999999999999999999999999999999999",
      "0x8888888888888888888888888888888888888888",
      "120",
      "1700000000000",
      "1700000000000",
      [
        "1:0x9999999999999999999999999999999999999999:0x8888888888888888888888888888888888888888:0x1111111111111111111111111111111111111111",
      ],
      [account],
    ]);
    expect(
      queries.some((entry) => entry.sql.includes("FOR UPDATE SKIP LOCKED")),
    ).toBe(true);
    const seededLookup = queries.find((entry) =>
      entry.sql.includes("WHERE id = ANY($1::text[])"),
    );
    expect(seededLookup?.params).toEqual([
      [
        "1:0x9999999999999999999999999999999999999999:0x8888888888888888888888888888888888888888:0x1111111111111111111111111111111111111111",
        "1:0x9999999999999999999999999999999999999999:0x8888888888888888888888888888888888888888:0x2222222222222222222222222222222222222222",
      ],
    ]);
  });

  it("reads multiple account states with one latest block lookup and chunked multicall", async () => {
    const queries: { sql: string; params?: unknown[] }[] = [];
    const dataSource = {
      transaction: async (callback: any) => callback(dataSource),
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes("FOR UPDATE SKIP LOCKED")) {
          return [
            {
              id: "task-1",
              chainId: 1,
              daoCode: "demo",
              governorAddress: "0x9999999999999999999999999999999999999999",
              tokenAddress: "0x8888888888888888888888888888888888888888",
              account: "0x1111111111111111111111111111111111111111",
              refreshBalance: true,
              refreshPower: true,
              attempts: 0,
            },
            {
              id: "task-2",
              chainId: 1,
              daoCode: "demo",
              governorAddress: "0x9999999999999999999999999999999999999999",
              tokenAddress: "0x8888888888888888888888888888888888888888",
              account: "0x2222222222222222222222222222222222222222",
              refreshBalance: true,
              refreshPower: true,
              attempts: 0,
            },
          ];
        }
        if (sql.includes("FROM contributor")) {
          return [
            {
              id: "0x1111111111111111111111111111111111111111",
              power: "3",
              balance: "2",
              delegatesCountAll: 0,
              delegatesCountEffective: 0,
            },
            {
              id: "0x2222222222222222222222222222222222222222",
              power: "5",
              balance: "4",
              delegatesCountAll: 0,
              delegatesCountEffective: 0,
            },
          ];
        }
        return [];
      }),
    };
    const chainTool = new ChainTool();
    jest.spyOn(chainTool, "latestBlock").mockResolvedValue({
      number: 123n,
      timestampMs: 1_700_000_000_000n,
    });
    jest.spyOn(chainTool, "tokenBalance");
    jest.spyOn(chainTool, "currentVotesWithSource");
    multicall.mockResolvedValue([
      { status: "success", result: 9n },
      { status: "success", result: 7n },
      { status: "success", result: 11n },
      { status: "success", result: 13n },
    ]);

    const result = await processOnchainRefreshBatch(dataSource as any, chainTool, {
      chainId: 1,
      daoCode: "demo",
      governorAddress: "0x9999999999999999999999999999999999999999",
      tokenAddress: "0x8888888888888888888888888888888888888888",
      rpcs: ["https://rpc.example"],
      multicallAddress: "0x7777777777777777777777777777777777777777",
      workerId: "worker-1",
      batchSize: 10,
      multicallChunkSize: 2,
      concurrency: 1,
      now: 1_700_000_000_000n,
    });

    expect(result).toEqual({ claimed: 2, processed: 2, failed: 0 });
    expect(chainTool.latestBlock).toHaveBeenCalledTimes(1);
    expect(chainTool.tokenBalance).not.toHaveBeenCalled();
    expect(chainTool.currentVotesWithSource).not.toHaveBeenCalled();
    expect(multicall).toHaveBeenCalledTimes(1);
    expect(multicall).toHaveBeenCalledWith(
      expect.objectContaining({
        blockNumber: 123n,
        multicallAddress: "0x7777777777777777777777777777777777777777",
        contracts: expect.arrayContaining([
          expect.objectContaining({
            functionName: "balanceOf",
            args: ["0x1111111111111111111111111111111111111111"],
          }),
          expect.objectContaining({
            functionName: "getVotes",
            args: ["0x2222222222222222222222222222222222222222"],
          }),
        ]),
      }),
    );
    const contributorInserts = queries.filter((entry) =>
      entry.sql.includes("INSERT INTO contributor"),
    );
    expect(contributorInserts).toHaveLength(1);
    expect(contributorInserts[0].params).toEqual(
      expect.arrayContaining(["9", "7", "11", "13"]),
    );
    const metricUpdates = queries.filter((entry) =>
      entry.sql.includes("INSERT INTO data_metric"),
    );
    expect(metricUpdates).toHaveLength(1);
    expect(metricUpdates[0].params).toEqual(expect.arrayContaining(["12"]));
  });

  it("marks only the failed account retryable when a multicall item fails", async () => {
    const queries: { sql: string; params?: unknown[] }[] = [];
    const dataSource = {
      transaction: async (callback: any) => callback(dataSource),
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes("FOR UPDATE SKIP LOCKED")) {
          return [
            {
              id: "task-1",
              chainId: 1,
              daoCode: "demo",
              governorAddress: "0x9999999999999999999999999999999999999999",
              tokenAddress: "0x8888888888888888888888888888888888888888",
              account: "0x1111111111111111111111111111111111111111",
              refreshBalance: true,
              refreshPower: true,
              attempts: 0,
            },
            {
              id: "task-2",
              chainId: 1,
              daoCode: "demo",
              governorAddress: "0x9999999999999999999999999999999999999999",
              tokenAddress: "0x8888888888888888888888888888888888888888",
              account: "0x2222222222222222222222222222222222222222",
              refreshBalance: true,
              refreshPower: true,
              attempts: 0,
            },
          ];
        }
        if (sql.includes("FROM contributor")) {
          return [];
        }
        return [];
      }),
    };
    const chainTool = new ChainTool();
    jest.spyOn(chainTool, "latestBlock").mockResolvedValue({
      number: 123n,
      timestampMs: 1_700_000_000_000n,
    });
    multicall.mockResolvedValue([
      { status: "success", result: 9n },
      { status: "success", result: 7n },
      { status: "failure", error: new Error("balance failed") },
      { status: "success", result: 13n },
    ]);

    const result = await processOnchainRefreshBatch(dataSource as any, chainTool, {
      chainId: 1,
      daoCode: "demo",
      governorAddress: "0x9999999999999999999999999999999999999999",
      tokenAddress: "0x8888888888888888888888888888888888888888",
      rpcs: ["https://rpc.example"],
      multicallAddress: "0x7777777777777777777777777777777777777777",
      workerId: "worker-1",
      batchSize: 10,
      multicallChunkSize: 2,
      concurrency: 1,
      now: 1_700_000_000_000n,
    });

    expect(result).toEqual({ claimed: 2, processed: 1, failed: 1 });
    expect(
      queries.some(
        (entry) =>
          entry.sql.includes("ELSE 'processed'") &&
          Array.isArray(entry.params?.[1]) &&
          entry.params[1].includes("task-1"),
      ),
    ).toBe(true);
    expect(
      queries.some(
        (entry) =>
          entry.sql.includes("status = 'pending'") &&
          entry.params?.includes("task-2"),
      ),
    ).toBe(true);
  });
});
