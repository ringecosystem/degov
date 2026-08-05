import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDaoOrganizationJsonLd,
  buildProposalWebPageJsonLd,
} from "../src/lib/structured-data.ts";

import type { ProposalItem } from "../src/services/graphql/types/index.ts";
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

const proposal: ProposalItem = {
  blockNumber: "123",
  blockTimestamp: "2026-08-05T00:00:00Z",
  calldatas: [],
  description:
    "Fund the next grants season with a staged treasury budget and public reporting.",
  id: "lisk-dao:1",
  proposalId: "1",
  proposer: "0x0000000000000000000000000000000000000001",
  signatures: [],
  targets: [],
  transactionHash: "0xabc",
  values: [],
  voteEnd: "20",
  voteStart: "10",
  voteStartTimestamp: "2026-08-06T00:00:00Z",
  voteEndTimestamp: "2026-08-07T00:00:00Z",
  clockMode: "blocknumber",
  quorum: "100",
  decimals: "18",
  title: "Treasury allocation for grants season 2",
  metricsVotesWeightAbstainSum: "0",
  metricsVotesWeightAgainstSum: "0",
  metricsVotesWeightForSum: "0",
  metricsVotesCount: "0",
  voters: [],
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

test("proposal WebPage JSON-LD describes the visible proposal page", () => {
  const jsonLd = buildProposalWebPageJsonLd(config, proposal);
  assert.ok(jsonLd);
  const data = JSON.parse(jsonLd);

  assert.deepEqual(data, {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": "https://lisk.degov.ai/proposal/1#webpage",
    url: "https://lisk.degov.ai/proposal/1",
    name: "Treasury allocation for grants season 2",
    mainEntityOfPage: "https://lisk.degov.ai/proposal/1",
    isPartOf: {
      "@id": "https://lisk.degov.ai/#website",
      name: "Lisk DAO governance site",
      url: "https://lisk.degov.ai",
    },
    about: {
      "@type": "Organization",
      "@id": "https://lisk.degov.ai/#organization",
      name: "Lisk DAO",
      url: "https://lisk.degov.ai",
    },
    identifier: "1",
    description:
      "Fund the next grants season with a staged treasury budget and public reporting.",
  });
  assert.equal(data.author, undefined, "proposal JSON-LD must not invent authorship");
  assert.equal(data.aggregateRating, undefined, "proposal JSON-LD must not emit ratings");
});

test("proposal WebPage JSON-LD is escaped, bounded, and not misclassified", () => {
  const jsonLd = buildProposalWebPageJsonLd(config, {
    ...proposal,
    title: "Proposal <script>alert(1)</script>",
    description: `<b>${"Very long proposal description ".repeat(20)}</b><discussion>private forum thread</discussion><signature>["transfer(address,uint256)"]</signature>`,
  });
  assert.ok(jsonLd);
  assert.ok(!jsonLd.includes("<"));

  const data = JSON.parse(jsonLd);
  assert.equal(data["@type"], "WebPage");
  assert.notEqual(data["@type"], "Article");
  assert.notEqual(data["@type"], "NewsArticle");
  assert.notEqual(data["@type"], "Legislation");
  assert.notEqual(data["@type"], "DiscussionForumPosting");
  assert.equal(data.name, "Proposal alert(1)");
  assert.ok(data.description.length <= 220);
  assert.ok(!data.description.includes("<b>"));
  assert.ok(!data.description.includes("private forum thread"));
  assert.ok(!data.description.includes("transfer(address,uint256)"));
});

test("proposal WebPage JSON-LD is omitted without a valid public page", () => {
  assert.equal(buildProposalWebPageJsonLd(config, null), null);
  assert.equal(
    buildProposalWebPageJsonLd({ ...config, siteUrl: "http://lisk.degov.ai" }, proposal),
    null
  );
  assert.equal(
    buildProposalWebPageJsonLd({ ...config, siteUrl: "https://localhost:3000" }, proposal),
    null
  );
});
