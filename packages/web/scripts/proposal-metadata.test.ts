import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProposalMetadata,
  cleanMetadataText,
} from "../src/lib/metadata.ts";

test("proposal metadata keeps a proposal-specific title and canonical url", () => {
  const metadata = buildProposalMetadata({
    config: {
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
    },
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
});

test("proposal metadata text cleaning removes markdown, html, and collapses whitespace", () => {
  const cleaned = cleanMetadataText(
    "# Hello **world**\n\nSee [forum](https://example.com) <discussion>ignored</discussion>"
  );

  assert.equal(cleaned, "Hello world See forum ignored");
});
