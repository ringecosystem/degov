import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(
  rootDir,
  "docs/spec/seo-geo-social-preview-contract.json"
);
const contract = JSON.parse(readFileSync(contractPath, "utf8"));

const requiredFixtureIds = new Set([
  "home.root",
  "docs.representative-page",
  "square.directory",
  "dao.home",
  "dao.proposal-detail",
  "atlas.dao-detail",
]);
const requiredSurfaces = new Set(["home", "docs", "square", "dao-sites", "atlas"]);
const requiredRepositories = new Set([
  "ringecosystem/degov",
  "ringecosystem/degov-agent-api",
  "ringecosystem/degov-docs",
  "ringecosystem/degov-home",
  "ringecosystem/degov-square",
]);
const requiredOgFields = new Set([
  "og:title",
  "og:type",
  "og:url",
  "og:image",
  "og:description",
  "og:site_name",
  "og:locale",
  "og:image:type",
  "og:image:width",
  "og:image:height",
  "og:image:alt",
]);
const requiredTwitterFields = new Set([
  "twitter:card",
  "twitter:title",
  "twitter:description",
  "twitter:image",
  "twitter:image:alt",
]);
const requiredPlatforms = new Set([
  "meta-facebook",
  "linkedin",
  "x-twitter",
  "slack",
  "discord",
  "telegram",
]);
const requiredPlatformEvidence = new Set([
  "rendered-title",
  "rendered-description",
  "rendered-image-url",
]);
const requiredAutomatedChecks = new Set([
  "raw-head-extraction",
  "canonical-og-twitter-url-agreement",
  "absolute-https-image-url",
  "image-status-mime-dimensions",
  "redirect-chain-limit",
  "explicit-cache-header",
  "safe-fallback",
  "dynamic-text-escaping-and-bounds",
  "invalid-private-route-exclusion",
]);
const requiredReleaseBlockingFailures = new Set([
  "missing-required-og-field",
  "missing-required-twitter-field",
  "wrong-host-canonical-og-or-image-url",
  "twitter-card-not-large-image",
  "image-not-public-200",
  "image-wrong-mime",
  "image-wrong-dimensions",
  "missing-image-alt",
  "unbounded-dynamic-text",
  "private-route-rich-public-card",
  "mutable-state-without-cache-version",
]);
const requiredTextFixtures = new Set([
  "long-dao-name",
  "long-proposal-title",
  "emoji",
  "ens-name",
  "ethereum-address",
  "non-latin-text",
]);
const requiredStageIds = new Set([
  "stable-baseline-assets",
  "bounded-entity-specific-assets",
]);
const allowedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const requiredDynamicInputRules = [
  /Escape all dynamic text/,
  /Bound title/,
  /Do not fetch arbitrary user-provided image URLs/,
  /Do not include wallet addresses/,
  /Do not include mutable proposal status/,
];

assert.equal(contract.version, 1);
assert.equal(contract.ownerIssue, "https://github.com/ringecosystem/degov/issues/1029");
assert.equal(contract.parentIssue, "https://github.com/ringecosystem/degov/issues/714");
assert.equal(
  contract.maintenance.contractPath,
  "docs/spec/seo-geo-social-preview-contract.json"
);
assert.equal(contract.maintenance.localCheck, "pnpm run test:seo-geo-social-preview");
assert.match(contract.maintenance.changeRule, /owner issue/);
assert.match(contract.maintenance.changeRule, /automated evidence/);
assert.match(contract.maintenance.changeRule, /#714-linked rationale/);

assert.equal(
  contract.stagePlan.length,
  new Set(contract.stagePlan.map((stage) => stage.id)).size,
  "stage IDs must be unique"
);
const stageIds = new Set(contract.stagePlan.map((stage) => stage.id));
for (const stageId of requiredStageIds) {
  assert.ok(stageIds.has(stageId), `missing stage ${stageId}`);
}
assert.equal(
  contract.stagePlan.find((stage) => stage.id === "stable-baseline-assets").status,
  "contracted"
);
assert.equal(
  contract.stagePlan.find((stage) => stage.id === "bounded-entity-specific-assets").status,
  "deferred-until-stage-1-stable"
);

for (const field of requiredOgFields) {
  assert.ok(
    contract.metadataContract.openGraphRequired.includes(field),
    `missing Open Graph field ${field}`
  );
}
for (const field of requiredTwitterFields) {
  assert.ok(
    contract.metadataContract.twitterRequired.includes(field),
    `missing Twitter field ${field}`
  );
}
assert.match(contract.metadataContract.canonicalUrlRule, /canonical URL, og:url, and Twitter/);
assert.match(contract.metadataContract.privateRouteRule, /Private, invalid/);

assert.equal(contract.imageSpec.primaryDimensions.width, 1200);
assert.equal(contract.imageSpec.primaryDimensions.height, 630);
for (const mimeType of contract.imageSpec.allowedMimeTypes) {
  assert.ok(allowedMimeTypes.has(mimeType), `unexpected MIME type ${mimeType}`);
}
assert.equal(contract.imageSpec.requiredTransport, "absolute-https-public-200");
assert.equal(contract.imageSpec.recommendedTwitterCard, "summary_large_image");
assert.match(contract.imageSpec.minimumCachePolicy, /Cache-Control/);
assert.match(contract.imageSpec.minimumCachePolicy, /cache-version/);
assert.match(contract.imageSpec.safeAreaRule, /1000x500/);
assert.deepEqual(contract.imageSpec.fallbackHierarchy, [
  "route-specific validated dynamic image",
  "surface-specific stable 1200x630 image",
  "DeGov-branded stable 1200x630 image",
]);
for (const rulePattern of requiredDynamicInputRules) {
  assert.ok(
    contract.imageSpec.dynamicInputRules.some((rule) => rulePattern.test(rule)),
    `missing dynamic input rule ${rulePattern}`
  );
}
for (const fixture of requiredTextFixtures) {
  assert.ok(
    contract.imageSpec.textFixtureRequirements.includes(fixture),
    `missing text fixture ${fixture}`
  );
}

assert.equal(
  contract.platforms.length,
  new Set(contract.platforms.map((platform) => platform.id)).size,
  "platform IDs must be unique"
);
const platformIds = new Set(contract.platforms.map((platform) => platform.id));
for (const platformId of requiredPlatforms) {
  assert.ok(platformIds.has(platformId), `missing platform ${platformId}`);
}
for (const platform of contract.platforms) {
  assert.equal(platform.verificationType, "manual-platform-readback");
  assert.equal(platform.status, "pending-real-platform-evidence");
  assert.ok(
    platform.requiredEvidence.includes("scrape-time") ||
      platform.requiredEvidence.includes("message-time"),
    `${platform.id} missing scrape-time or message-time`
  );
  for (const evidence of requiredPlatformEvidence) {
    assert.ok(
      platform.requiredEvidence.includes(evidence),
      `${platform.id} missing ${evidence}`
    );
  }
}

assert.equal(
  contract.priorityFixtures.length,
  new Set(contract.priorityFixtures.map((fixture) => fixture.id)).size,
  "fixture IDs must be unique"
);
const fixtureIds = new Set(contract.priorityFixtures.map((fixture) => fixture.id));
for (const fixtureId of requiredFixtureIds) {
  assert.ok(fixtureIds.has(fixtureId), `missing fixture ${fixtureId}`);
}
for (const fixture of contract.priorityFixtures) {
  assert.ok(requiredSurfaces.has(fixture.surface), `${fixture.id} surface`);
  assert.ok(requiredRepositories.has(fixture.repository), `${fixture.id} repository`);
  assert.match(fixture.fixtureUrl, /^https:\/\//, `${fixture.id} fixtureUrl`);
  assert.ok(fixture.canonicalPattern.length > 0, `${fixture.id} canonicalPattern`);
  assert.ok(["website", "article", "article-or-website"].includes(fixture.expectedOgType));
  assert.equal(fixture.requiredMetadata, "standard-og-twitter");
  assert.equal(fixture.platformEvidenceStatus, "pending");
  assert.ok(fixture.notes.length > 40, `${fixture.id} notes`);
}

const daoHome = contract.priorityFixtures.find((fixture) => fixture.id === "dao.home");
assert.equal(daoHome.repository, "ringecosystem/degov");
assert.equal(daoHome.imageStatus, "current-512x512-follow-up-required");
assert.ok(daoHome.additionalFixtureUrls.includes("https://lisk.degov.ai/"));

const daoProposal = contract.priorityFixtures.find(
  (fixture) => fixture.id === "dao.proposal-detail"
);
assert.equal(daoProposal.expectedOgType, "article");
assert.equal(daoProposal.imageStatus, "current-generic-follow-up-required");
assert.match(daoProposal.notes, /mutable status\/vote values remain excluded/);

const regressionIds = new Set(contract.regressionFixtures.map((fixture) => fixture.id));
assert.ok(
  regressionIds.has("demo-degov-wrong-development-host"),
  "missing demo.degov.ai wrong-host regression"
);
assert.ok(
  regressionIds.has("private-route-public-card"),
  "missing private route public card regression"
);
for (const regression of contract.regressionFixtures) {
  assert.match(regression.fixtureUrl, /^https:\/\//);
  assert.ok(regression.expectedRule.length > 60);
}

for (const check of requiredAutomatedChecks) {
  assert.ok(
    contract.automatedValidation.requiredChecks.includes(check),
    `missing automated check ${check}`
  );
}
for (const failure of requiredReleaseBlockingFailures) {
  assert.ok(
    contract.automatedValidation.releaseBlockingFailures.includes(failure),
    `missing release-blocking failure ${failure}`
  );
}
assert.ok(
  contract.automatedValidation.informationalOnly.includes("stale-platform-cache"),
  "platform cache state must stay informational"
);

const followUpRepos = new Set(
  contract.repositoryFollowUps.map((followUp) => followUp.repository)
);
for (const repository of requiredRepositories) {
  assert.ok(followUpRepos.has(repository), `missing follow-up for ${repository}`);
}
for (const followUp of contract.repositoryFollowUps) {
  assert.equal(followUp.status, "required");
  assert.ok(followUp.scope.length > 50, `${followUp.repository} scope`);
}

assert.equal(contract.completionState.contractApproved, false);
assert.equal(contract.completionState.automatedFixtureCoverage, "contract-only");
assert.equal(contract.completionState.realPlatformEvidence, "pending");
assert.equal(contract.completionState.repositoryFollowUpsLinked, false);
assert.match(contract.completionState.closeIssueWhen, /Meta\/LinkedIn\/X/);
assert.match(contract.completionState.closeIssueWhen, /Slack\/Discord\/Telegram/);

console.log(
  `SEO/GEO social preview contract ok: ${contract.priorityFixtures.length} fixtures, ${contract.platforms.length} platforms, ${contract.repositoryFollowUps.length} repository follow-ups`
);
