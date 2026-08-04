import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProposalMetadata,
  buildSiteMetadata,
  cleanMetadataText,
  SOCIAL_PREVIEW_IMAGE_HEIGHT,
  SOCIAL_PREVIEW_IMAGE_PATH,
  SOCIAL_PREVIEW_IMAGE_TYPE,
  SOCIAL_PREVIEW_IMAGE_WIDTH,
} from "../src/lib/metadata.ts";

const liskConfig = {
  name: "Lisk",
  code: "lisk-dao",
  logo: "https://example.com/logo.png",
  siteUrl: "https://lisk.degov.ai",
  description: "Lisk DAO",
  links: {},
  wallet: { walletConnectProjectId: "abc" },
  chain: {
    id: 1135,
    name: "Lisk",
    logo: "https://example.com/chain.png",
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

test("proposal metadata keeps a proposal-specific title and canonical url", () => {
  const metadata = buildProposalMetadata({
    config: liskConfig,
    proposalId: "0xb1318bd67737f2fe8a918bfd691ac5e69e174a0c9455bcc36b80a3ccc7caa878",
    title: "Treasury allocation for grants season 2",
    description: "Fund the next grants season with a staged treasury budget.",
  });

  assert.equal(metadata.title, "Treasury allocation for grants season 2");
  assert.equal(
    metadata.alternates?.canonical,
    "https://lisk.degov.ai/proposal/0xb1318bd67737f2fe8a918bfd691ac5e69e174a0c9455bcc36b80a3ccc7caa878"
  );
  assert.equal(
    metadata.openGraph?.title,
    "Treasury allocation for grants season 2 | Lisk"
  );
  assert.equal(
    metadata.twitter?.description,
    "Fund the next grants season with a staged treasury budget."
  );
  assert.equal(metadata.twitter?.card, "summary_large_image");
  assert.deepEqual(metadata.twitter?.images, [
    {
      url: `https://lisk.degov.ai${SOCIAL_PREVIEW_IMAGE_PATH}`,
      alt: "Lisk proposal share card",
    },
  ]);
  assert.deepEqual(metadata.openGraph?.images, [
    {
      url: `https://lisk.degov.ai${SOCIAL_PREVIEW_IMAGE_PATH}`,
      width: SOCIAL_PREVIEW_IMAGE_WIDTH,
      height: SOCIAL_PREVIEW_IMAGE_HEIGHT,
      type: SOCIAL_PREVIEW_IMAGE_TYPE,
      alt: "Lisk proposal share card",
    },
  ]);
});

test("site metadata uses a host-correct large social preview image", () => {
  const metadata = buildSiteMetadata(liskConfig);

  assert.equal(metadata.openGraph?.url, "https://lisk.degov.ai");
  assert.equal(metadata.twitter?.card, "summary_large_image");
  assert.deepEqual(metadata.openGraph?.images, [
    {
      url: `https://lisk.degov.ai${SOCIAL_PREVIEW_IMAGE_PATH}`,
      width: SOCIAL_PREVIEW_IMAGE_WIDTH,
      height: SOCIAL_PREVIEW_IMAGE_HEIGHT,
      type: SOCIAL_PREVIEW_IMAGE_TYPE,
      alt: "Lisk DAO governance share card",
    },
  ]);
  assert.deepEqual(metadata.twitter?.images, [
    {
      url: `https://lisk.degov.ai${SOCIAL_PREVIEW_IMAGE_PATH}`,
      alt: "Lisk DAO governance share card",
    },
  ]);
});

test("proposal metadata text cleaning removes markdown, html, and collapses whitespace", () => {
  const cleaned = cleanMetadataText(
    "# Hello **world**\n\nSee [forum](https://example.com) <discussion>ignored</discussion>"
  );

  assert.equal(cleaned, "Hello world See forum ignored");
});
