import assert from "node:assert/strict";
import test from "node:test";

import { buildDaoOrganizationJsonLd } from "../src/lib/structured-data.ts";

import type { Config } from "../src/types/config.ts";

const config: Config = {
  name: "Lisk DAO",
  code: "lisk-dao",
  logo: "https://lisk.degov.ai/logo.png",
  siteUrl: "https://lisk.degov.ai",
  description:
    "Lisk DAO coordinates governance proposals, treasury decisions, and protocol upgrades.",
  links: {
    website: "https://lisk.com",
    twitter: "https://x.com/LiskHQ",
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
    governor: "0x123",
    governorToken: {
      address: "0x456",
      standard: "ERC20",
    },
  },
  treasuryAssets: [],
  indexer: {
    endpoint: "https://indexer.degov.ai/lisk-dao/graphql",
    startBlock: 1,
  },
};

test("DAO Organization JSON-LD uses the validated DAO canonical origin", () => {
  const jsonLd = buildDaoOrganizationJsonLd(config);
  assert.ok(jsonLd);
  const data = JSON.parse(jsonLd);

  assert.deepEqual(data, {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://lisk.degov.ai/#organization",
    name: "Lisk DAO",
    url: "https://lisk.degov.ai",
    mainEntityOfPage: "https://lisk.degov.ai",
    description:
      "Lisk DAO coordinates governance proposals, treasury decisions, and protocol upgrades.",
  });
  assert.equal(data.sameAs, undefined, "unverified sameAs links must not be emitted");
});

test("DAO Organization JSON-LD is escaped and bounded", () => {
  const jsonLd = buildDaoOrganizationJsonLd({
    ...config,
    name: "Example <DAO>",
    description: `<b>${"Very long DAO description ".repeat(20)}</b>`,
  });
  assert.ok(jsonLd);
  assert.ok(!jsonLd.includes("<"));

  const data = JSON.parse(jsonLd);
  assert.equal(data.name, "Example <DAO>");
  assert.ok(data.description.length <= 220);
  assert.ok(!data.description.includes("<b>"));
});

test("DAO Organization JSON-LD is omitted without a public HTTPS DAO origin", () => {
  assert.equal(
    buildDaoOrganizationJsonLd({ ...config, siteUrl: "http://lisk.degov.ai" }),
    null
  );
  assert.equal(
    buildDaoOrganizationJsonLd({ ...config, siteUrl: "https://localhost:3000" }),
    null
  );
});
