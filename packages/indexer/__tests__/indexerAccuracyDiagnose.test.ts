const {
  classifyMappingAnomaly,
  classifyNegativeDelegate,
  collectNegativeDelegateSignals,
  parseArgs,
} = require("../scripts/indexer-accuracy-diagnose");

export {};

describe("indexer accuracy diagnose", () => {
  it("parses required address and known target flags", () => {
    expect(
      parseArgs([
        "--address",
        "0x983110309620d911731ac0932219af06091b6744",
        "--code",
        "ens-dao",
        "--mapping-limit",
        "25",
      ]),
    ).toMatchObject({
      address: "0x983110309620d911731ac0932219af06091b6744",
      code: "ens-dao",
      mappingLimit: 25,
    });
  });

  it("classifies stale and power mismatch mapping anomalies", () => {
    expect(
      classifyMappingAnomaly({
        indexedPower: 569n,
        chainBalance: 0n,
        chainDelegate: "0x983110309620d911731ac0932219af06091b6744",
        expectedDelegate: "0x983110309620d911731ac0932219af06091b6744",
      }),
    ).toBe("power-not-cleared-after-balance-zero");

    expect(
      classifyMappingAnomaly({
        indexedPower: 100n,
        chainBalance: 100n,
        chainDelegate: "0x1111111111111111111111111111111111111111",
        expectedDelegate: "0x2222222222222222222222222222222222222222",
      }),
    ).toBe("stale-target-mismatch");

    expect(
      classifyMappingAnomaly({
        indexedPower: -1n,
        chainBalance: 0n,
        chainDelegate: "0x2222222222222222222222222222222222222222",
        expectedDelegate: "0x2222222222222222222222222222222222222222",
      }),
    ).toBe("negative-mapping-power");
  });

  it("classifies negative delegate rows caused by tx-local rolling mismatches and drift", () => {
    expect(
      classifyNegativeDelegate({
        row: {
          fromDelegate: "0x1",
          toDelegate: "0x2",
          power: "-10",
          isCurrent: true,
        },
        currentMapping: {
          from: "0x1",
          to: "0x2",
          power: "0",
        },
        history: {
          delegateChangeds: [],
          tokenTransfers: [],
        },
      }),
    ).toBe("current-delegate-drift-after-mapping-zeroed");

    expect(
      classifyNegativeDelegate({
        row: {
          fromDelegate: "0x1",
          toDelegate: "0x2",
          power: "-10",
          isCurrent: true,
        },
        currentMapping: {
          from: "0x1",
          to: "0x2",
          power: "-10",
        },
        history: {
          delegateChangeds: [
            {
              fromDelegate: "0x2",
              toDelegate: "0x2",
              transactionHash: "0xtx",
            },
          ],
          tokenTransfers: [{ transactionHash: "0xtx" }],
        },
      }),
    ).toBe("negative-mapping-from-tx-local-rolling-mismatch");
  });

  it("collects tx-local rolling mismatch signals for negative delegate rows", () => {
    expect(
      collectNegativeDelegateSignals({
        row: {
          fromDelegate: "0x1",
          toDelegate: "0x2",
          power: "-10",
          isCurrent: true,
        },
        currentMapping: {
          from: "0x1",
          to: "0x2",
          power: "-10",
        },
        history: {
          delegateChangeds: [
            {
              fromDelegate: "0x2",
              toDelegate: "0x2",
              transactionHash: "0xtx-1",
            },
            {
              fromDelegate: "0x0",
              toDelegate: "0x2",
              transactionHash: "0xtx-1",
            },
          ],
          tokenTransfers: [{ transactionHash: "0xtx-1" }],
        },
      }),
    ).toMatchObject({
      noopChangesInSameTarget: true,
      sameTargetDelegateChangeCount: 2,
      overlappingDelegateChangeCount: 2,
      mappingPower: -10n,
      rowPower: -10n,
    });
  });
});
