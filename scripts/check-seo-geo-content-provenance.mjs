import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(
  rootDir,
  "docs/spec/seo-geo-content-provenance-contract.json"
);
const contract = JSON.parse(readFileSync(contractPath, "utf8"));

const requiredSurfaces = new Set(["home", "docs", "square", "dao-sites", "atlas"]);
const requiredRepositories = new Set([
  "ringecosystem/degov",
  "ringecosystem/degov-agent-api",
  "ringecosystem/degov-docs",
  "ringecosystem/degov-home",
  "ringecosystem/degov-square",
]);
const requiredIntentIds = new Set([
  "product-definition",
  "product-relationship",
  "supported-governance",
  "dao-onboarding",
  "proposal-lifecycle",
  "indexing-data-freshness",
  "dao-entity-facts",
  "objective-comparison",
  "atlas-square-methodology",
]);
const requiredClaimGroups = new Set([
  "degov-product-purpose",
  "surface-purpose",
  "supported-chain",
  "governance-model",
  "proposal-state",
  "indexing-lag",
  "dao-identity",
  "official-dao-link",
  "computed-metric",
  "comparison-scope",
]);
const requiredContentKinds = new Set([
  "product-copy",
  "editorial-content",
  "on-chain-fact",
  "indexed-observation",
  "computed-metric",
]);
const requiredAuditIds = new Set([
  "home.root",
  "docs.representative-page",
  "square.directory",
  "dao.home",
  "dao.proposal-detail",
  "atlas.dao-detail",
]);
const requiredPageQualityRules = new Set([
  "directAnswerRule",
  "canonicalUrlRule",
  "headingRule",
  "definitionRule",
  "sourceRule",
  "entityRule",
  "statusRule",
  "historyRule",
  "caveatRule",
]);
const requiredFreshnessRules = new Set([
  "contentReviewedAt",
  "contentUpdatedAt",
  "sourceDataAsOf",
  "syncStatus",
  "stalenessQueueRule",
  "unknownFreshnessRule",
]);
const requiredProvenanceRules = new Set([
  "primaryEvidencePreference",
  "computedMetricRule",
  "citationSupportRule",
  "coverageGapRule",
  "thirdPartyCopyRule",
]);
const requiredBaselineEvidence = new Set([
  "dated query text",
  "surface and URL inspected",
  "current canonical answer page or gap",
  "citation/source-support result",
  "search or answer-engine observation when available",
  "known limitations",
]);
const requiredCiChecks = new Set([
  "contract-json-parse",
  "priority-intent-coverage",
  "claim-owner-coverage",
  "surface-audit-coverage",
  "content-kind-distinction",
  "freshness-provenance-rules",
  "follow-up-blockers",
  "explicit-rejection-coverage",
  "baseline-plan-required",
]);
const requiredManualChecks = new Set([
  "representative-page-raw-html-audit",
  "primary-source-link-readback",
  "query-citation-baseline",
  "owner-approval-for-content-change",
  "post-release-search-or-answer-observation",
]);
const requiredReleaseBlockingFailures = new Set([
  "fake-date-or-build-time-freshness",
  "hidden-seo-text",
  "unsupported-competitor-claim",
  "factual-page-without-source",
  "copied-third-party-description-without-authority",
  "computed-metric-without-methodology",
  "priority-content-change-before-baseline",
  "client-only-critical-link",
  "duplicate-canonical-answer-owner",
]);
const requiredRejectionIds = new Set([
  "mass-thin-pages",
  "hidden-seo-text",
  "fake-freshness",
  "unsupported-competitor-claims",
  "source-free-computed-metrics",
  "third-party-copy-without-authority",
]);

function assertFields(object, fields, label) {
  for (const field of fields) {
    assert.ok(Object.hasOwn(object, field), `${label} missing ${field}`);
  }
}

function assertUnique(items, key, label) {
  assert.equal(
    items.length,
    new Set(items.map((item) => item[key])).size,
    `${label} must have unique ${key}`
  );
}

assert.equal(contract.version, 1);
assert.equal(contract.ownerIssue, "https://github.com/ringecosystem/degov/issues/1027");
assert.equal(contract.parentIssue, "https://github.com/ringecosystem/degov/issues/714");
assert.equal(
  contract.maintenance.contractPath,
  "docs/spec/seo-geo-content-provenance-contract.json"
);
assert.equal(contract.maintenance.localCheck, "pnpm run test:seo-geo-content-provenance");
assert.match(contract.maintenance.changeRule, /owner issue/);
assert.match(contract.maintenance.changeRule, /source evidence/);
assert.match(contract.maintenance.changeRule, /#714-linked rationale/);
assert.match(contract.maintenance.closeIssueWhen, /repository-specific implementation issues/);
assert.match(contract.maintenance.closeIssueWhen, /pre-change query\/citation\/search baseline/);

assert.match(contract.sourcePolicy.sourceUseRule, /primary or first-party sources/);
assert.match(contract.sourcePolicy.sourceUseRule, /Do not copy third-party descriptions/);

assert.ok(
  contract.priorityIntents.length >= 5 && contract.priorityIntents.length <= 10,
  "priority intents must stay within the approved 5-10 range"
);
assertUnique(contract.priorityIntents, "id", "priority intents");
const intentIds = new Set(contract.priorityIntents.map((intent) => intent.id));
for (const intentId of requiredIntentIds) {
  assert.ok(intentIds.has(intentId), `missing priority intent ${intentId}`);
}
for (const intent of contract.priorityIntents) {
  assertFields(
    intent,
    [
      "id",
      "question",
      "claimGroups",
      "canonicalOwnerSurface",
      "canonicalRepository",
      "secondarySurfaces",
      "expectedAnswerShape",
      "baselineRequired",
    ],
    intent.id
  );
  assert.ok(requiredSurfaces.has(intent.canonicalOwnerSurface), `${intent.id} owner surface`);
  assert.ok(requiredRepositories.has(intent.canonicalRepository), `${intent.id} repository`);
  assert.ok(intent.claimGroups.length > 0, `${intent.id} claim groups`);
  assert.equal(intent.baselineRequired, true, `${intent.id} baseline`);
  assert.ok(intent.expectedAnswerShape.length > 80, `${intent.id} expected answer`);
}

assertUnique(contract.claimOwnership, "claimGroup", "claim ownership");
const claimGroups = new Set(contract.claimOwnership.map((claim) => claim.claimGroup));
for (const claimGroup of requiredClaimGroups) {
  assert.ok(claimGroups.has(claimGroup), `missing claim group ${claimGroup}`);
}
for (const intent of contract.priorityIntents) {
  for (const claimGroup of intent.claimGroups) {
    assert.ok(claimGroups.has(claimGroup), `${intent.id} references unknown claim ${claimGroup}`);
  }
}
for (const claim of contract.claimOwnership) {
  assertFields(
    claim,
    [
      "claimGroup",
      "canonicalOwnerSurface",
      "canonicalRepository",
      "claimKind",
      "requiredEvidence",
      "duplicateRisk",
      "freshnessAuthority",
    ],
    claim.claimGroup
  );
  assert.ok(requiredSurfaces.has(claim.canonicalOwnerSurface), `${claim.claimGroup} surface`);
  assert.ok(requiredRepositories.has(claim.canonicalRepository), `${claim.claimGroup} repository`);
  assert.ok(requiredContentKinds.has(claim.claimKind), `${claim.claimGroup} kind`);
  assert.ok(claim.requiredEvidence.length >= 2, `${claim.claimGroup} evidence`);
  assert.ok(claim.duplicateRisk.length > 50, `${claim.claimGroup} duplicate risk`);
}

assertFields(contract.pageQualityContract, requiredPageQualityRules, "pageQualityContract");
assert.match(contract.pageQualityContract.directAnswerRule, /near the beginning/);
assert.match(contract.pageQualityContract.sourceRule, /primary or first-party evidence/);
assert.match(contract.pageQualityContract.statusRule, /on-chain facts, indexed observations, computed metrics/);
assert.match(contract.pageQualityContract.historyRule, /historical proposal pages/);

assertFields(contract.freshnessContract, requiredFreshnessRules, "freshnessContract");
assert.match(contract.freshnessContract.contentReviewedAt, /Do not update it merely because/);
assert.match(contract.freshnessContract.sourceDataAsOf, /source data freshness/);
assert.match(contract.freshnessContract.syncStatus, /separate from page publish/);

assertFields(contract.provenanceContract, requiredProvenanceRules, "provenanceContract");
assert.ok(
  contract.provenanceContract.primaryEvidencePreference.includes("on-chain contract or transaction"),
  "missing on-chain primary evidence"
);
assert.match(contract.provenanceContract.computedMetricRule, /formula or method/);
assert.match(contract.provenanceContract.citationSupportRule, /support the adjacent claim/);
assert.match(contract.provenanceContract.coverageGapRule, /visible/);

for (const surface of requiredSurfaces) {
  assert.ok(Object.hasOwn(contract.internalLinkContract, surface), `missing links for ${surface}`);
  assert.ok(contract.internalLinkContract[surface].length > 0, `${surface} links`);
}
assert.match(contract.internalLinkContract.linkAvailabilityRule, /rendered HTML/);

assertUnique(contract.contentKindRules, "kind", "content kind rules");
const contentKinds = new Set(contract.contentKindRules.map((rule) => rule.kind));
for (const contentKind of requiredContentKinds) {
  assert.ok(contentKinds.has(contentKind), `missing content kind ${contentKind}`);
}
for (const rule of contract.contentKindRules) {
  assert.ok(rule.allowedSurfaces.length > 0, `${rule.kind} surfaces`);
  for (const surface of rule.allowedSurfaces) {
    assert.ok(requiredSurfaces.has(surface), `${rule.kind} invalid surface ${surface}`);
  }
  assert.ok(rule.requiredFreshness.length > 0, `${rule.kind} freshness`);
  assert.ok(rule.forbiddenClaims.length > 0, `${rule.kind} forbidden claims`);
}

assertUnique(contract.representativeSurfaceAudits, "id", "surface audits");
const auditIds = new Set(contract.representativeSurfaceAudits.map((audit) => audit.id));
for (const auditId of requiredAuditIds) {
  assert.ok(auditIds.has(auditId), `missing representative audit ${auditId}`);
}
for (const audit of contract.representativeSurfaceAudits) {
  assert.ok(requiredSurfaces.has(audit.surface), `${audit.id} surface`);
  assert.ok(requiredRepositories.has(audit.repository), `${audit.id} repository`);
  assert.match(audit.representativeUrl, /^https:\/\//, `${audit.id} URL`);
  assert.equal(audit.auditStatus, "contract-required");
  assert.ok(audit.requiredChecks.length >= 4, `${audit.id} required checks`);
  assert.ok(["high", "medium", "low"].includes(audit.gapPriority), `${audit.id} priority`);
  assert.equal(audit.followUpRequired, true, `${audit.id} follow-up`);
}

assert.match(contract.gapPrioritization.high, /Blocks a priority answer/);
assert.match(contract.gapPrioritization.orderingRule, /user value and citation value/);

assert.equal(contract.baselinePlan.requiredBeforeFirstContentCohort, true);
assert.ok(contract.baselinePlan.querySet.length >= 5, "baseline query set");
for (const evidence of requiredBaselineEvidence) {
  assert.ok(
    contract.baselinePlan.requiredEvidence.includes(evidence),
    `missing baseline evidence ${evidence}`
  );
}
assert.match(contract.baselinePlan.storageRule, /before changing the first content cohort/);
assert.match(contract.baselinePlan.noScoreRule, /one proprietary GEO score/);

assert.equal(contract.repositoryFollowUps.length, requiredSurfaces.size);
for (const followUp of contract.repositoryFollowUps) {
  assert.ok(requiredRepositories.has(followUp.repository), `${followUp.surface} repository`);
  assert.ok(requiredSurfaces.has(followUp.surface), `${followUp.surface} surface`);
  assert.equal(followUp.issueRequired, true, `${followUp.surface} issue`);
  assert.equal(followUp.blocksClose, true, `${followUp.surface} close blocker`);
  assert.ok(followUp.scope.length > 80, `${followUp.surface} scope`);
}

assertUnique(contract.explicitRejections, "id", "explicit rejections");
const rejectionIds = new Set(contract.explicitRejections.map((item) => item.id));
for (const rejectionId of requiredRejectionIds) {
  assert.ok(rejectionIds.has(rejectionId), `missing rejection ${rejectionId}`);
}
for (const rejection of contract.explicitRejections) {
  assert.ok(rejection.rejectedPractice.length > 40, `${rejection.id} practice`);
  assert.ok(rejection.reason.length > 40, `${rejection.id} reason`);
  assert.equal(rejection.releaseBlocking, true, `${rejection.id} release blocking`);
}

for (const check of requiredCiChecks) {
  assert.ok(contract.validation.ciChecks.includes(check), `missing CI check ${check}`);
}
for (const check of requiredManualChecks) {
  assert.ok(contract.validation.manualChecks.includes(check), `missing manual check ${check}`);
}
for (const failure of requiredReleaseBlockingFailures) {
  assert.ok(
    contract.validation.releaseBlockingFailures.includes(failure),
    `missing release blocking failure ${failure}`
  );
}
assert.match(contract.validation.rollback, /Revert the affected content/);
assert.match(contract.validation.rollback, /#714 rationale/);

console.log(
  `SEO/GEO content provenance contract ok: ${contract.priorityIntents.length} intents, ${contract.claimOwnership.length} claim owners, ${contract.representativeSurfaceAudits.length} audits`
);
