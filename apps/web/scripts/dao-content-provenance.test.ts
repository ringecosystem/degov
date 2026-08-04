import assert from "node:assert/strict";
import test from "node:test";

import { buildDaoPublicSummaryFacts } from "../src/lib/dao-public-summary.ts";

import type { Config } from "../src/types/config.ts";

const liskConfig: Config = {
  name: "Lisk",
  code: "lisk-dao",
  logo: "https://lisk.degov.ai/logo.png",
  siteUrl: "https://lisk.degov.ai",
  offChainDiscussionUrl: "https://forum.lisk.com",
  editLink: "https://github.com/ringecosystem/degov-registry/blob/main/daos/lisk-dao.yml",
  description: "A purpose built L2 for builders in high-growth markets.",
  links: {
    website: "https://lisk.com",
  },
  wallet: { walletConnectProjectId: "abc" },
  chain: {
    id: 1135,
    name: "Lisk",
    logo: "https://lisk.degov.ai/chain.png",
    rpcs: ["https://rpc.api.lisk.com"],
    explorers: ["https://blockscout.lisk.com"],
    nativeToken: {
      symbol: "ETH",
      decimals: 18,
      priceId: "ethereum",
    },
  },
  contracts: {
    governor: "0x58a61b1807a7bDA541855DaAEAEe89b1DDA48568",
    governorToken: {
      address: "0x2eE6Eca46d2406454708a1C80356a6E63b57D404",
      standard: "ERC20",
    },
    timeLock: "0x2294A7f24187B84995A2A28112f82f07BE1BceAD",
  },
  treasuryAssets: [],
  indexer: {
    endpoint: "https://indexer.degov.ai/lisk-dao/graphql",
    startBlock: 568752,
  },
};

test("DAO homepage provenance facts expose canonical registry and contract sources", () => {
  const facts = buildDaoPublicSummaryFacts(liskConfig);

  assert.equal(facts.canonicalSiteUrl, "https://lisk.degov.ai/");
  assert.equal(facts.officialWebsiteUrl, "https://lisk.com/");
  assert.equal(facts.discussionUrl, "https://forum.lisk.com/");
  assert.equal(
    facts.registrySourceUrl,
    "https://github.com/ringecosystem/degov-registry/blob/main/daos/lisk-dao.yml"
  );
  assert.deepEqual(facts.chain, {
    id: 1135,
    name: "Lisk",
    explorerUrl: "https://blockscout.lisk.com/",
  });
  assert.deepEqual(facts.contracts.governor, {
    address: "0x58a61b1807a7bDA541855DaAEAEe89b1DDA48568",
    url: "https://blockscout.lisk.com/address/0x58a61b1807a7bDA541855DaAEAEe89b1DDA48568",
  });
  assert.deepEqual(facts.contracts.governanceToken, {
    address: "0x2eE6Eca46d2406454708a1C80356a6E63b57D404",
    standard: "ERC20",
    url: "https://blockscout.lisk.com/address/0x2eE6Eca46d2406454708a1C80356a6E63b57D404",
  });
  assert.deepEqual(facts.contracts.timelock, {
    address: "0x2294A7f24187B84995A2A28112f82f07BE1BceAD",
    url: "https://blockscout.lisk.com/address/0x2294A7f24187B84995A2A28112f82f07BE1BceAD",
  });
  assert.deepEqual(facts.indexer, {
    endpoint: "https://indexer.degov.ai/lisk-dao/graphql",
    startBlock: 568752,
  });
});

test("DAO homepage provenance facts reject non-http external links", () => {
  const facts = buildDaoPublicSummaryFacts({
    ...liskConfig,
    siteUrl: " https://user:password@lisk.degov.ai ",
    links: { website: "data:text/html,phish" },
    offChainDiscussionUrl: "mailto:security@example.com",
    editLink: "/relative",
    chain: {
      ...liskConfig.chain,
      explorers: ["javascript:alert(1)"],
    },
  });

  assert.equal(facts.canonicalSiteUrl, null);
  assert.equal(facts.officialWebsiteUrl, null);
  assert.equal(facts.discussionUrl, null);
  assert.equal(facts.registrySourceUrl, null);
  assert.equal(facts.chain.explorerUrl, null);
  assert.equal(facts.contracts.governor.url, null);
  assert.equal(facts.contracts.governanceToken.url, null);
  assert.equal(facts.contracts.timelock?.url, null);
});

test("DAO homepage provenance facts trim safe URLs", () => {
  const facts = buildDaoPublicSummaryFacts({
    ...liskConfig,
    links: { website: " https://lisk.com/docs " },
  });

  assert.equal(facts.officialWebsiteUrl, "https://lisk.com/docs");
});
