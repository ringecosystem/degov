import { Contributor } from "../../model";
import {
  buildDelegateCountAdjustments,
  prepareContributorCountUpdate,
} from "./delegateCounts";

describe("delegateCounts service", () => {
  it("buildDelegateCountAdjustments 过滤零地址并生成增量", () => {
    expect(buildDelegateCountAdjustments(undefined, undefined)).toEqual([]);
    expect(
      buildDelegateCountAdjustments(
        "0x0000000000000000000000000000000000000000",
        "0x123"
      )
    ).toEqual([{ address: "0x123", delta: 1 }]);
    expect(
      buildDelegateCountAdjustments("0xabcDEF", "0xabcDEF")
    ).toEqual([]);
    expect(
      buildDelegateCountAdjustments("0xaaa", "0xbbB")
    ).toEqual([
      { address: "0xaaa", delta: -1 },
      { address: "0xbbb", delta: 1 },
    ]);
  });

  it("prepareContributorCountUpdate 创建新贡献者并保证不为负", () => {
    const result = prepareContributorCountUpdate({
      delegate: "0x123",
      delta: -3,
      blockNumber: 1n,
      blockTimestamp: 2n,
      transactionHash: "0xhash",
    });

    expect(result.isNew).toBe(true);
    expect(result.contributor.id).toBe("0x123");
    expect(result.contributor.delegateCount).toBe(0);
  });

  it("prepareContributorCountUpdate 复用已有贡献者并累加", () => {
    const existing = new Contributor({
      id: "0xabc",
      blockNumber: 0n,
      blockTimestamp: 0n,
      transactionHash: "0x0",
      power: 0n,
      delegateCount: 2,
    });

    const result = prepareContributorCountUpdate({
      delegate: "0xAbC",
      delta: 1,
      blockNumber: 10n,
      blockTimestamp: 30n,
      transactionHash: "0x1",
      existingContributor: existing,
    });

    expect(result.isNew).toBe(false);
    expect(result.contributor.blockNumber).toBe(10n);
    expect(result.contributor.delegateCount).toBe(3);
  });
});
