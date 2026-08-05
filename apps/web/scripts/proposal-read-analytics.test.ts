import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildProposalReadEventParams,
  getChannelGroupFromReferrer,
  PROPOSAL_READ_EVENT_NAME,
} from "../src/lib/analytics.ts";

const readSource = (relativePath: string) =>
  readFileSync(path.join(import.meta.dirname, "..", relativePath), "utf8");

test("proposal read channel groups use observable referrer categories", () => {
  assert.equal(
    getChannelGroupFromReferrer(undefined, "lisk.degov.ai"),
    "direct-unknown"
  );
  assert.equal(
    getChannelGroupFromReferrer("https://lisk.degov.ai/proposals", "lisk.degov.ai"),
    "direct-unknown"
  );
  assert.equal(
    getChannelGroupFromReferrer(
      "https://www.lisk.degov.ai/proposals",
      "lisk.degov.ai"
    ),
    "direct-unknown"
  );
  assert.equal(
    getChannelGroupFromReferrer("https://www.google.com/search?q=lisk+dao", "lisk.degov.ai"),
    "organic-search"
  );
  assert.equal(
    getChannelGroupFromReferrer("https://x.com/ringecosystem", "lisk.degov.ai"),
    "social-organic"
  );
  assert.equal(
    getChannelGroupFromReferrer("https://docs.degov.ai/guide", "lisk.degov.ai"),
    "documentation-referral"
  );
  assert.equal(
    getChannelGroupFromReferrer("https://square.degov.ai/dao/lisk", "lisk.degov.ai"),
    "cross-product-degov-referral"
  );
  assert.equal(
    getChannelGroupFromReferrer("https://chatgpt.com/share/example", "lisk.degov.ai"),
    "ai-search-assistant-referral"
  );
  assert.equal(
    getChannelGroupFromReferrer("https://example.com/post", "lisk.degov.ai"),
    "other-external-referral"
  );
  assert.equal(
    getChannelGroupFromReferrer("https://sex.com/post", "lisk.degov.ai"),
    "other-external-referral"
  );
  assert.equal(
    getChannelGroupFromReferrer("https://evilbing.com/post", "lisk.degov.ai"),
    "other-external-referral"
  );
});

test("proposal read event params match the privacy-safe contract allowlist", () => {
  const params = buildProposalReadEventParams({
    daoCode: "lisk-dao",
    proposalId: "123",
    locale: "en",
    referrer: "https://chatgpt.com/",
    currentHost: "lisk.degov.ai",
  });

  assert.equal(PROPOSAL_READ_EVENT_NAME, "degov_proposal_read");
  assert.deepEqual(Object.keys(params).sort(), [
    "channel_group",
    "dao_slug_or_public_id",
    "proposal_public_id",
    "route_locale",
    "source_surface",
  ]);
  assert.deepEqual(params, {
    source_surface: "dao-sites",
    dao_slug_or_public_id: "lisk-dao",
    proposal_public_id: "123",
    channel_group: "ai-search-assistant-referral",
    route_locale: "en",
  });
});

test("proposal read analytics source avoids sensitive payload fields", () => {
  const analyticsSource = readSource("src/lib/analytics.ts");
  const componentSource = readSource(
    "src/app/proposal/[id]/proposal-read-analytics.tsx"
  );
  const combinedSource = `${analyticsSource}\n${componentSource}`;
  const prohibitedPayloadFields = [
    "wallet_address",
    "vote_choice",
    "token_balance",
    "voting_power",
    "proposal_draft",
    "auth_state",
    "full_query_string",
    "unpublished_proposal_text",
  ];

  for (const field of prohibitedPayloadFields) {
    assert.doesNotMatch(combinedSource, new RegExp(field));
  }
  assert.doesNotMatch(combinedSource, /window\.location\.search/);
  assert.doesNotMatch(combinedSource, /window\.location\.href/);
});

test("proposal page only renders read analytics after a public proposal resolves", () => {
  const pageSource = readSource("src/app/proposal/[id]/page.tsx");
  const detailClientSource = readSource(
    "src/app/proposal/[id]/proposal-detail-client.tsx"
  );
  const componentSource = readSource(
    "src/app/proposal/[id]/proposal-read-analytics.tsx"
  );

  assert.doesNotMatch(pageSource, /import \{ ProposalReadAnalytics \}/);
  assert.match(detailClientSource, /import \{ ProposalReadAnalytics \}/);
  assert.match(detailClientSource, /data\?\.proposalId \? \(/);
  assert.match(detailClientSource, /daoCode=\{daoConfig\?\.code \?\? ""\}/);
  assert.match(detailClientSource, /proposalId=\{data\.proposalId\}/);
  assert.match(
    componentSource,
    /PROPOSAL_READ_EVENT_NAME}:\$\{params\.dao_slug_or_public_id}:\$\{params\.proposal_public_id}/
  );
  assert.doesNotMatch(
    componentSource,
    /dedupeKey = .*params\.route_locale/
  );
});
