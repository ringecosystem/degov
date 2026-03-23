import assert from "node:assert/strict";
import test from "node:test";

import yaml from "js-yaml";

import {
  buildFallbackTreasuryAssets,
  hasConfiguredTreasuryAssets,
} from "../src/hooks/treasury-assets-config.ts";

test("empty treasuryAssets yaml key is treated as missing config", () => {
  const parsed = yaml.load("treasuryAssets:\n") as {
    treasuryAssets?: null;
  };

  assert.equal(parsed.treasuryAssets, null);
  assert.equal(hasConfiguredTreasuryAssets(parsed.treasuryAssets), false);
});

test("non-empty treasuryAssets array is treated as configured", () => {
  const parsed = yaml.load(`
treasuryAssets:
  - name: ENS
    contract: "0x1234"
    standard: ERC20
`) as {
    treasuryAssets: {
      name: string;
      contract: string;
      standard: string;
    }[];
  };

  assert.equal(hasConfiguredTreasuryAssets(parsed.treasuryAssets), true);
});

test("fallback treasury assets include the governor token when config is missing", () => {
  assert.deepEqual(
    buildFallbackTreasuryAssets({
      address: "0xabc",
      standard: "erc20",
    }),
    [
      {
        name: "Governance Token",
        contract: "0xabc",
        standard: "ERC20",
        logo: null,
      },
    ]
  );
});

test("fallback treasury assets stay empty without a usable governor token", () => {
  assert.deepEqual(buildFallbackTreasuryAssets(undefined), []);
  assert.deepEqual(buildFallbackTreasuryAssets({ address: "0xabc" }), []);
  assert.deepEqual(buildFallbackTreasuryAssets({ standard: "ERC20" }), []);
});
