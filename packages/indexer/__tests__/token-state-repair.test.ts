import {
  aggregateContributorsFromMappings,
  selectEffectiveDelegations,
} from "../src/internal/token-state-repair";

describe("token state repair helpers", () => {
  it("prefers the latest delegate change over fallback mappings", () => {
    expect(
      selectEffectiveDelegations({
        fallbackRows: [
          {
            delegator: "0x1111111111111111111111111111111111111111",
            toDelegate: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
        ],
        latestChanges: [
          {
            delegator: "0x1111111111111111111111111111111111111111",
            toDelegate: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          },
        ],
      }),
    ).toEqual([
      {
        delegator: "0x1111111111111111111111111111111111111111",
        toDelegate: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    ]);
  });

  it("drops undelegated rows when the latest change points at the zero address", () => {
    expect(
      selectEffectiveDelegations({
        fallbackRows: [
          {
            delegator: "0x1111111111111111111111111111111111111111",
            toDelegate: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
        ],
        latestChanges: [
          {
            delegator: "0x1111111111111111111111111111111111111111",
            toDelegate: "0x0000000000000000000000000000000000000000",
          },
        ],
      }),
    ).toEqual([]);
  });

  it("rebuilds contributor aggregates from repaired current mappings", () => {
    expect(
      aggregateContributorsFromMappings([
        {
          delegator: "0x1111111111111111111111111111111111111111",
          toDelegate: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          power: 10n,
        },
        {
          delegator: "0x2222222222222222222222222222222222222222",
          toDelegate: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          power: 0n,
        },
        {
          delegator: "0x3333333333333333333333333333333333333333",
          toDelegate: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          power: -5n,
        },
      ]),
    ).toEqual([
      {
        contributorId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        power: 10n,
        delegatesCountAll: 2,
        delegatesCountEffective: 1,
      },
      {
        contributorId: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        power: 0n,
        delegatesCountAll: 1,
        delegatesCountEffective: 0,
      },
    ]);
  });
});
