import assert from "node:assert/strict";
import test from "node:test";

import { loadConfigYaml } from "../src/lib/config-yaml.ts";

test("loadConfigYaml preserves unquoted contract addresses as strings", () => {
  const config = loadConfigYaml(`
contracts:
  governor: 0x7ae22bebF28366c328d5558E6Fad935487299DfE
  governorToken:
    address: 0x970C30646E5c95DC77A3D768C4362E113Ed92b5b
    standard: ERC20
chain:
  id: 1
`) as {
    contracts: {
      governor: unknown;
      governorToken: {
        address: unknown;
        standard: string;
      };
    };
    chain: {
      id: unknown;
    };
  };

  assert.equal(config.contracts.governor, "0x7ae22bebF28366c328d5558E6Fad935487299DfE");
  assert.equal(typeof config.contracts.governor, "string");
  assert.equal(
    config.contracts.governorToken.address,
    "0x970C30646E5c95DC77A3D768C4362E113Ed92b5b"
  );
  assert.equal(typeof config.contracts.governorToken.address, "string");
});

test("loadConfigYaml keeps hex numeric fields as numbers", () => {
  const config = loadConfigYaml(`
chain:
  id: 0x1
indexer:
  startBlock: 0x10
contracts:
  governor: 0x7ae22bebF28366c328d5558E6Fad935487299DfE
`) as {
    chain: {
      id: unknown;
    };
    indexer: {
      startBlock: unknown;
    };
  };

  assert.equal(config.chain.id, 1);
  assert.equal(typeof config.chain.id, "number");
  assert.equal(config.indexer.startBlock, 16);
  assert.equal(typeof config.indexer.startBlock, "number");
});
