import { processOnchainRefreshBatch } from "../../src/onchain-refresh/worker";
import { ChainTool } from "../../src/internal/chaintool";

describe("onchain refresh worker", () => {
  it("updates contributor state before marking locked tasks processed", async () => {
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
    const markProcessedIndex = queries.findIndex((entry) =>
      entry.sql.includes("status = 'processed'"),
    );
    expect(updateContributorIndex).toBeGreaterThan(-1);
    expect(markProcessedIndex).toBeGreaterThan(updateContributorIndex);
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
      queries.some((entry) => entry.sql.includes("status = 'processed'")),
    ).toBe(false);
    expect(queries.some((entry) => entry.sql.includes("status = 'pending'"))).toBe(
      true,
    );
  });
});
