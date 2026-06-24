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

  it("uses the native DeGov checkpoint height before falling back to stale squid processor status", async () => {
    const queries: { sql: string; params?: unknown[] }[] = [];
    const dataSource = {
      transaction: async (callback: any) => callback(dataSource),
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes("FROM degov_indexer_checkpoint")) {
          return [{ height: "195", rowCount: "1" }];
        }
        if (sql.includes('"squid_processor".status')) {
          return [{ height: "100" }];
        }
        if (sql.includes("FOR UPDATE SKIP LOCKED")) {
          return [];
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
      daoCode: "demo",
      governorAddress: "0x9999999999999999999999999999999999999999",
      tokenAddress: "0x8888888888888888888888888888888888888888",
      rpcs: ["https://rpc.example"],
      workerId: "worker-1",
      batchSize: 10,
      maxSyncLagBlocks: 50,
      now: 1_700_000_000_000n,
    });

    expect(result).toEqual({
      claimed: 0,
      processed: 0,
      failed: 0,
    });
    expect(queries[0].sql).toContain("FROM degov_indexer_checkpoint");
    expect(queries[0].params).toEqual([
      1,
      "demo",
      null,
      null,
      null,
    ]);
    expect(
      queries.some((entry) => entry.sql.includes('"squid_processor".status')),
    ).toBe(false);
    expect(
      queries.some((entry) => entry.sql.includes("FOR UPDATE SKIP LOCKED")),
    ).toBe(true);
  });

  it("falls back to squid processor status when the native DeGov checkpoint table is missing", async () => {
    const queries: { sql: string; params?: unknown[] }[] = [];
    const dataSource = {
      transaction: async (callback: any) => callback(dataSource),
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes("FROM degov_indexer_checkpoint")) {
          throw { code: "42P01" };
        }
        if (sql.includes('"squid_processor".status')) {
          return [{ height: "195" }];
        }
        if (sql.includes("FOR UPDATE SKIP LOCKED")) {
          return [];
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
      daoCode: "demo",
      governorAddress: "0x9999999999999999999999999999999999999999",
      tokenAddress: "0x8888888888888888888888888888888888888888",
      rpcs: ["https://rpc.example"],
      workerId: "worker-1",
      batchSize: 10,
      maxSyncLagBlocks: 50,
      now: 1_700_000_000_000n,
    });

    expect(result).toEqual({
      claimed: 0,
      processed: 0,
      failed: 0,
    });
    expect(
      queries.some((entry) => entry.sql.includes('"squid_processor".status')),
    ).toBe(true);
  });

  it("keeps the processor unready when a native DeGov checkpoint row exists without a processed height", async () => {
    const queries: { sql: string; params?: unknown[] }[] = [];
    const dataSource = {
      transaction: async (callback: any) => callback(dataSource),
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes("FROM degov_indexer_checkpoint")) {
          return [{ height: null, rowCount: "1" }];
        }
        if (sql.includes('"squid_processor".status')) {
          return [{ height: "200" }];
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
      daoCode: "demo",
      governorAddress: "0x9999999999999999999999999999999999999999",
      tokenAddress: "0x8888888888888888888888888888888888888888",
      rpcs: ["https://rpc.example"],
      workerId: "worker-1",
      batchSize: 10,
      maxSyncLagBlocks: 50,
      now: 1_700_000_000_000n,
    });

    expect(result).toEqual({
      claimed: 0,
      processed: 0,
      failed: 0,
      skipped: "processor-unready",
    });
    expect(
      queries.some((entry) => entry.sql.includes('"squid_processor".status')),
    ).toBe(false);
  });

  it("does not mask missing onchain refresh task schema after the native checkpoint guard passes", async () => {
    const dataSource = {
      transaction: async (callback: any) => callback(dataSource),
      query: jest.fn(async (sql: string) => {
        if (sql.includes("FROM degov_indexer_checkpoint")) {
          return [{ height: "195", rowCount: "1" }];
        }
        if (sql.includes("onchain_refresh_task")) {
          throw { code: "42P01" };
        }
        return [];
      }),
    };
    const chainTool = new ChainTool();
    jest.spyOn(chainTool, "latestBlock").mockResolvedValue({
      number: 200n,
      timestampMs: 1_700_000_000_000n,
    });

    await expect(
      processOnchainRefreshBatch(dataSource as any, chainTool, {
        chainId: 1,
        daoCode: "demo",
        governorAddress: "0x9999999999999999999999999999999999999999",
        tokenAddress: "0x8888888888888888888888888888888888888888",
        rpcs: ["https://rpc.example"],
        workerId: "worker-1",
        batchSize: 10,
        maxSyncLagBlocks: 50,
        now: 1_700_000_000_000n,
      }),
    ).rejects.toEqual({ code: "42P01" });
  });

  it("seeds and claims only reconcile tasks while the processor is still far behind the chain head", async () => {
    const account = "0x1111111111111111111111111111111111111111";
    let claimCalls = 0;
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
          sql.includes("latest_activity") &&
          sql.includes("onchain_refresh_task")
        ) {
          return [];
        }
        if (sql.includes("FOR UPDATE SKIP LOCKED")) {
          claimCalls += 1;
          expect(sql).toContain("btrim(reason_item) = 'reconcile'");
          if (claimCalls === 1) {
            return [];
          }
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
      seedLimitReached: false,
      accountsKnown: 1,
      accountsScanned: 1,
      nextStartAfterAccount: account,
      syncLagBlocks: "100",
      claimMode: "reconcile-only",
    });
    expect(
      queries.some((entry) => entry.sql.includes("INSERT INTO onchain_refresh_task")),
    ).toBe(true);
    expect(claimCalls).toBe(2);
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

  it("claims pending reconcile tasks before seeding more accounts", async () => {
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
          throw new Error("seed should not run while pending tasks are claimable");
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
      syncLagBlocks: "100",
      claimMode: "reconcile-only",
    });
    expect(
      queries.some((entry) => entry.sql.includes("known_accounts")),
    ).toBe(false);
    expect(
      queries.some((entry) => entry.sql.includes("INSERT INTO onchain_refresh_task")),
    ).toBe(false);
  });

  it("seeds reconcile tasks after the processor lag guard passes", async () => {
    const account = "0x1111111111111111111111111111111111111111";
    const alreadySeeded = "0x2222222222222222222222222222222222222222";
    let claimCalls = 0;
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
          sql.includes("latest_activity") &&
          sql.includes("onchain_refresh_task")
        ) {
          return [{ account: alreadySeeded }];
        }
        if (sql.includes("FOR UPDATE SKIP LOCKED")) {
          claimCalls += 1;
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
      reconcileSeedBatchSize: 1,
      maxSyncLagBlocks: 5,
      seedReconcile: true,
      now: 1_700_000_000_000n,
    });

    expect(result).toEqual({
      claimed: 0,
      processed: 0,
      failed: 0,
      seeded: 1,
      seedLimitReached: true,
      accountsKnown: 2,
      accountsScanned: 1,
      nextStartAfterAccount: account,
    });
    expect(chainTool.tokenBalance).not.toHaveBeenCalled();
    expect(chainTool.currentVotesWithSource).not.toHaveBeenCalled();
    expect(claimCalls).toBe(2);
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
      entry.sql.includes("latest_activity"),
    );
    expect(seededLookup?.sql).toContain("latest_activity");
    expect(seededLookup?.sql).toContain("delegate_votes_changed");
    expect(seededLookup?.sql).toContain("token_transfer");
    expect(seededLookup?.sql).toContain("task.last_seen_block_number");
    expect(seededLookup?.params).toEqual([
      [
        "1:0x9999999999999999999999999999999999999999:0x8888888888888888888888888888888888888888:0x1111111111111111111111111111111111111111",
      ],
      [
        "0x1111111111111111111111111111111111111111",
      ],
      1,
      "0x9999999999999999999999999999999999999999",
    ]);
  });

  it("limits reconcile seed scanning even when scanned accounts are already seeded", async () => {
    const accounts = [
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
    ];
    const queries: { sql: string; params?: unknown[] }[] = [];
    const dataSource = {
      transaction: async (callback: any) => callback(dataSource),
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes('"squid_processor".status')) {
          return [{ height: "120" }];
        }
        if (sql.includes("known_accounts")) {
          return accounts.map((account) => ({ account }));
        }
        if (
          sql.includes("latest_activity") &&
          sql.includes("onchain_refresh_task")
        ) {
          return accounts.slice(0, 2).map((account) => ({ account }));
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

    const result = await processOnchainRefreshBatch(dataSource as any, chainTool, {
      chainId: 1,
      daoCode: "demo",
      governorAddress: "0x9999999999999999999999999999999999999999",
      tokenAddress: "0x8888888888888888888888888888888888888888",
      rpcs: ["https://rpc.example"],
      workerId: "worker-1",
      batchSize: 10,
      reconcileSeedBatchSize: 2,
      maxSyncLagBlocks: 5,
      seedReconcile: true,
      now: 1_700_000_000_000n,
    });

    expect(result).toEqual({
      claimed: 0,
      processed: 0,
      failed: 0,
      seeded: 0,
      seedLimitReached: true,
      accountsKnown: 3,
      accountsScanned: 2,
      nextStartAfterAccount: accounts[1],
    });
    const seededLookups = queries.filter((entry) =>
      entry.sql.includes("latest_activity"),
    );
    expect(seededLookups).toHaveLength(1);
    expect(seededLookups[0].params?.[1]).toEqual(accounts.slice(0, 2));
    expect(
      queries.some((entry) =>
        entry.sql.includes("INSERT INTO onchain_refresh_task"),
      ),
    ).toBe(false);
  });

  it("continues reconcile seed scanning after the provided cursor", async () => {
    const accounts = [
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
    ];
    const queries: { sql: string; params?: unknown[] }[] = [];
    const dataSource = {
      transaction: async (callback: any) => callback(dataSource),
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes('"squid_processor".status')) {
          return [{ height: "120" }];
        }
        if (sql.includes("known_accounts")) {
          return accounts.map((account) => ({ account }));
        }
        if (
          sql.includes("latest_activity") &&
          sql.includes("onchain_refresh_task")
        ) {
          return [{ account: accounts[1] }];
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

    const result = await processOnchainRefreshBatch(dataSource as any, chainTool, {
      chainId: 1,
      daoCode: "demo",
      governorAddress: "0x9999999999999999999999999999999999999999",
      tokenAddress: "0x8888888888888888888888888888888888888888",
      rpcs: ["https://rpc.example"],
      workerId: "worker-1",
      batchSize: 10,
      reconcileSeedBatchSize: 2,
      reconcileSeedStartAfterAccount: accounts[0],
      maxSyncLagBlocks: 5,
      seedReconcile: true,
      now: 1_700_000_000_000n,
    } as any);

    expect(result).toEqual({
      claimed: 0,
      processed: 0,
      failed: 0,
      seeded: 1,
      seedLimitReached: false,
      accountsKnown: 3,
      accountsScanned: 2,
      nextStartAfterAccount: accounts[2],
    });
    const seededLookup = queries.find((entry) =>
      entry.sql.includes("latest_activity"),
    );
    expect(seededLookup?.params?.[1]).toEqual(accounts.slice(1));
    const taskInsert = queries.find((entry) =>
      entry.sql.includes("INSERT INTO onchain_refresh_task"),
    );
    expect(taskInsert?.params?.[8]).toEqual([accounts[2]]);
  });

  it("re-seeds a processed reconcile task when later indexed activity exists", async () => {
    const staleAccount = "0x1111111111111111111111111111111111111111";
    const upToDateAccount = "0x2222222222222222222222222222222222222222";
    const queries: { sql: string; params?: unknown[] }[] = [];
    const dataSource = {
      transaction: async (callback: any) => callback(dataSource),
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes('"squid_processor".status')) {
          return [{ height: "250" }];
        }
        if (sql.includes("known_accounts")) {
          return [{ account: staleAccount }, { account: upToDateAccount }];
        }
        if (
          sql.includes("latest_activity") &&
          sql.includes("onchain_refresh_task")
        ) {
          return [{ account: upToDateAccount }];
        }
        if (sql.includes("FOR UPDATE SKIP LOCKED")) {
          return [];
        }
        return [];
      }),
    };
    const chainTool = new ChainTool();
    jest.spyOn(chainTool, "latestBlock").mockResolvedValue({
      number: 252n,
      timestampMs: 1_700_000_000_000n,
    });

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
      seedLimitReached: false,
      accountsKnown: 2,
      accountsScanned: 2,
      nextStartAfterAccount: upToDateAccount,
    });
    const seededLookup = queries.find((entry) =>
      entry.sql.includes("latest_activity"),
    );
    expect(seededLookup?.sql).toContain(
      "COALESCE(latest_activity.block_number, 0) <= task.last_seen_block_number",
    );
    expect(seededLookup?.sql).toContain(
      "task.status IN ('pending', 'processing')",
    );
    const taskInsert = queries.find((entry) =>
      entry.sql.includes("INSERT INTO onchain_refresh_task"),
    );
    expect(taskInsert?.params).toEqual([
      1,
      "demo",
      "0x9999999999999999999999999999999999999999",
      "0x8888888888888888888888888888888888888888",
      "250",
      "1700000000000",
      "1700000000000",
      [
        "1:0x9999999999999999999999999999999999999999:0x8888888888888888888888888888888888888888:0x1111111111111111111111111111111111111111",
      ],
      [staleAccount],
    ]);
  });

  it("does not duplicate a reconcile task that is still pending or processing", async () => {
    const account = "0x1111111111111111111111111111111111111111";
    const queries: { sql: string; params?: unknown[] }[] = [];
    const dataSource = {
      transaction: async (callback: any) => callback(dataSource),
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes('"squid_processor".status')) {
          return [{ height: "250" }];
        }
        if (sql.includes("known_accounts")) {
          return [{ account }];
        }
        if (
          sql.includes("latest_activity") &&
          sql.includes("onchain_refresh_task")
        ) {
          return [{ account }];
        }
        if (sql.includes("FOR UPDATE SKIP LOCKED")) {
          return [];
        }
        return [];
      }),
    };
    const chainTool = new ChainTool();
    jest.spyOn(chainTool, "latestBlock").mockResolvedValue({
      number: 252n,
      timestampMs: 1_700_000_000_000n,
    });

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
      seeded: 0,
      seedLimitReached: false,
      accountsKnown: 1,
      accountsScanned: 1,
      nextStartAfterAccount: account,
    });
    expect(
      queries.some((entry) =>
        entry.sql.includes("INSERT INTO onchain_refresh_task"),
      ),
    ).toBe(false);
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

  it("falls back to getCurrentVotes when getVotes fails in multicall", async () => {
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
          return [
            {
              id: "0x1111111111111111111111111111111111111111",
              power: "3",
              balance: "2",
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
    multicall
      .mockResolvedValueOnce([
        { status: "success", result: 9n },
        { status: "failure", error: new Error("missing getVotes") },
      ])
      .mockResolvedValueOnce([{ status: "success", result: 7n }]);

    const result = await processOnchainRefreshBatch(dataSource as any, chainTool, {
      chainId: 1,
      daoCode: "demo",
      governorAddress: "0x9999999999999999999999999999999999999999",
      tokenAddress: "0x8888888888888888888888888888888888888888",
      rpcs: ["https://rpc.example"],
      multicallAddress: "0x7777777777777777777777777777777777777777",
      workerId: "worker-1",
      batchSize: 10,
      multicallChunkSize: 1,
      concurrency: 1,
      now: 1_700_000_000_000n,
    });

    expect(result).toEqual({ claimed: 1, processed: 1, failed: 0 });
    expect(chainTool.tokenBalance).not.toHaveBeenCalled();
    expect(chainTool.currentVotesWithSource).not.toHaveBeenCalled();
    expect(multicall).toHaveBeenCalledTimes(2);
    expect(multicall).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        contracts: [
          expect.objectContaining({ functionName: "balanceOf" }),
          expect.objectContaining({ functionName: "getVotes" }),
        ],
      }),
    );
    expect(multicall).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        contracts: [
          expect.objectContaining({
            functionName: "getCurrentVotes",
            args: ["0x1111111111111111111111111111111111111111"],
          }),
        ],
      }),
    );
    const contributorInsert = queries.find((entry) =>
      entry.sql.includes("INSERT INTO contributor"),
    );
    expect(contributorInsert?.params).toEqual(
      expect.arrayContaining(["9", "7"]),
    );
    const powerCheckpoint = queries.find((entry) =>
      entry.sql.includes("INSERT INTO vote_power_checkpoint"),
    );
    expect(powerCheckpoint?.params).toEqual(
      expect.arrayContaining(["getCurrentVotes"]),
    );
  });

  it("handles mixed multicall power fallback success and failure per task", async () => {
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
            {
              id: "task-3",
              chainId: 1,
              daoCode: "demo",
              governorAddress: "0x9999999999999999999999999999999999999999",
              tokenAddress: "0x8888888888888888888888888888888888888888",
              account: "0x3333333333333333333333333333333333333333",
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
    multicall
      .mockResolvedValueOnce([
        { status: "success", result: 9n },
        { status: "success", result: 7n },
        { status: "success", result: 11n },
        { status: "failure", error: new Error("missing getVotes") },
        { status: "success", result: 13n },
        { status: "failure", error: new Error("missing getVotes") },
      ])
      .mockResolvedValueOnce([
        { status: "success", result: 17n },
        { status: "failure", error: new Error("missing getCurrentVotes") },
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
      multicallChunkSize: 3,
      concurrency: 1,
      now: 1_700_000_000_000n,
    });

    expect(result).toEqual({ claimed: 3, processed: 2, failed: 1 });
    expect(multicall).toHaveBeenCalledTimes(2);
    expect(multicall).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        contracts: [
          expect.objectContaining({
            functionName: "getCurrentVotes",
            args: ["0x2222222222222222222222222222222222222222"],
          }),
          expect.objectContaining({
            functionName: "getCurrentVotes",
            args: ["0x3333333333333333333333333333333333333333"],
          }),
        ],
      }),
    );
    expect(
      queries.some(
        (entry) =>
          entry.sql.includes("ELSE 'processed'") &&
          Array.isArray(entry.params?.[1]) &&
          entry.params[1].includes("task-1") &&
          entry.params[1].includes("task-2") &&
          !entry.params[1].includes("task-3"),
      ),
    ).toBe(true);
    expect(
      queries.some(
        (entry) =>
          entry.sql.includes("status = 'pending'") &&
          entry.params?.includes("task-3"),
      ),
    ).toBe(true);
    const contributorInsert = queries.find((entry) =>
      entry.sql.includes("INSERT INTO contributor"),
    );
    expect(contributorInsert?.params).toEqual(
      expect.arrayContaining(["9", "7", "11", "17"]),
    );
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
