import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const readSource = (relativePath: string) =>
  readFileSync(path.join(import.meta.dirname, "..", relativePath), "utf8");

test("DAO homepage uses the established product UI without a duplicate summary", () => {
  const pageSource = readSource("src/app/page.tsx");
  const homeSource = readSource("src/app/_components/home-client.tsx");
  const headerSource = readSource("src/app/_components/dao-header.tsx");
  const summarySource = readSource(
    "src/app/_components/public-route-summary.tsx"
  );

  assert.match(pageSource, /<HomeClient \/>/);
  assert.doesNotMatch(pageSource, /DaoPublicSummary/);
  assert.doesNotMatch(pageSource, /sr-only|display:\s*none|visibility:\s*hidden/);
  assert.match(pageSource, /buildDaoOrganizationJsonLd\(config\)/);
  assert.match(pageSource, /type="application\/ld\+json"/);

  assert.match(homeSource, /<DaoHeader \/>/);
  assert.match(homeSource, /<Overview \/>/);
  assert.match(homeSource, /<Proposals \/>/);
  assert.match(headerSource, /<h1/);
  assert.match(headerSource, /\{config\?\.name\}/);
  assert.doesNotMatch(summarySource, /DaoPublicSummary|Registry source/);
});

test("proposal detail keeps its crawler fallback out of the interactive UI", () => {
  const pageSource = readSource("src/app/proposal/[id]/page.tsx");

  assert.match(
    pageSource,
    /<div\s+hidden\s+data-crawler-summary=""\s+dangerouslySetInnerHTML=\{\{\s*__html:\s*proposalSummaryHtml\s*\}\}\s*\/>/
  );
  assert.doesNotMatch(pageSource, /<noscript/);
  assert.match(pageSource, /<ProposalDetailClient \/>/);
  assert.match(pageSource, /buildProposalWebPageJsonLd\(config, proposal\)/);
  assert.match(pageSource, /type="application\/ld\+json"/);
});
