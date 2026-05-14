import {
  parseDebounceMs,
  upsertOnchainRefreshTask,
} from "../../src/onchain-refresh/task";

describe("onchain refresh task", () => {
  it("defaults debounce to two minutes", () => {
    expect(parseDebounceMs()).toBe(120_000n);
  });

  it("uses a conditional upsert that preserves active locks", async () => {
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => [
      {
        id: "1:0x9999999999999999999999999999999999999999:0x8888888888888888888888888888888888888888:0x1111111111111111111111111111111111111111",
        chainId: 1,
        daoCode: "demo",
        governorAddress: "0x9999999999999999999999999999999999999999",
        tokenAddress: "0x8888888888888888888888888888888888888888",
        account: "0x1111111111111111111111111111111111111111",
        refreshBalance: true,
        refreshPower: true,
        reason: "delegate-change+transfer",
        firstSeenBlockNumber: "10",
        lastSeenBlockNumber: "11",
        lastSeenBlockTimestamp: "1001",
        lastSeenTransactionHash: "0xabc",
        status: "processing",
        attempts: 1,
        nextRunAt: "2000",
        lockedAt: "1900",
        lockedBy: "worker-1",
        processedAt: null,
        error: null,
        pendingAfterLock: true,
        pendingAfterLockBlockNumber: "11",
        pendingAfterLockBlockTimestamp: "1001",
        pendingAfterLockTransactionHash: "0xabc",
        createdAt: "1000",
        updatedAt: "2000",
      },
    ]);
    const store = {
      query,
      findOne: jest.fn(),
      save: jest.fn(),
      insert: jest.fn(),
    };

    const task = await upsertOnchainRefreshTask(store as any, {
      chainId: 1,
      daoCode: "demo",
      governorAddress: "0x9999999999999999999999999999999999999999",
      tokenAddress: "0x8888888888888888888888888888888888888888",
      account: "0x1111111111111111111111111111111111111111",
      refreshBalance: true,
      refreshPower: true,
      reason: "delegate-change",
      blockNumber: 11n,
      blockTimestamp: 1001n,
      transactionHash: "0xabc",
      now: 2000n,
      debounceMs: 0n,
    });

    expect(store.findOne).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
    expect(store.insert).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE SET");
    expect(sql).toContain("status = CASE");
    expect(sql).toContain("THEN onchain_refresh_task.status");
    expect(sql).toContain("locked_at = CASE");
    expect(sql).toContain("THEN onchain_refresh_task.locked_at");
    expect(sql).toContain("locked_by = CASE");
    expect(sql).toContain("THEN onchain_refresh_task.locked_by");
    expect(sql).toContain("pending_after_lock = CASE");
    expect(sql).toContain("THEN true");
    expect(sql).toContain("pending_after_lock_block_number = CASE");
    expect(sql).toContain("GREATEST(");
    expect(params).toEqual([
      "1:0x9999999999999999999999999999999999999999:0x8888888888888888888888888888888888888888:0x1111111111111111111111111111111111111111",
      1,
      "demo",
      "0x9999999999999999999999999999999999999999",
      "0x8888888888888888888888888888888888888888",
      "0x1111111111111111111111111111111111111111",
      true,
      true,
      "delegate-change",
      "11",
      "1001",
      "0xabc",
      "2000",
      "2000",
    ]);
    expect(task.pendingAfterLock).toBe(true);
    expect(task.lockedAt).toBe(1900n);
    expect(task.lockedBy).toBe("worker-1");
  });
});
