import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(
  rootDir,
  "docs/spec/seo-geo-structured-data-contract.json"
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
const requiredDecisionIds = new Set([
  "home.root",
  "home.pricing-content",
  "docs.breadcrumb",
  "docs.article",
  "square.directory",
  "dao.home",
  "dao.proposal-detail",
  "atlas.dao-detail",
  "atlas.participant-profile",
  "atlas.dataset",
]);
const approvedOrConditionalIds = new Set([
  "home.root",
  "home.pricing-content",
  "docs.breadcrumb",
  "square.directory",
  "dao.home",
  "dao.proposal-detail",
  "atlas.dao-detail",
]);
const deferredIds = new Set([
  "docs.article",
  "atlas.participant-profile",
  "atlas.dataset",
]);
const requiredSourceKeys = new Set([
  "googleStructuredDataIntro",
  "googleStructuredDataGeneralGuidelines",
  "googleSupportedGallery",
  "googleBreadcrumb",
  "googleArticle",
  "googleProfilePage",
  "googleFaqChange",
  "schemaOrganization",
  "schemaWebSite",
  "schemaWebPage",
  "schemaCollectionPage",
  "schemaItemList",
  "schemaCreativeWork",
  "schemaDataset",
]);
const requiredPublisherFields = new Set([
  "id",
  "type",
  "stableAtId",
  "canonicalUrl",
  "name",
  "sameAsPolicy",
  "surfaces",
]);
const requiredDaoRuleFields = new Set([
  "type",
  "stableAtIdPattern",
  "canonicalUrlPattern",
  "sameAsPolicy",
  "hostIsolationRule",
  "visibleContentRule",
]);
const requiredDecisionFields = new Set([
  "id",
  "surface",
  "repository",
  "candidateTypes",
  "decision",
  "rationale",
  "googleSupportedFeature",
  "schemaSemanticFit",
  "requiredVisibleEvidence",
  "requiredProperties",
  "forbiddenProperties",
  "validation",
  "rollback",
]);
const allowedDecisions = new Set([
  "approved-existing-recheck-required",
  "approved-conditional",
  "deferred",
  "rejected",
]);
const allowedSemanticFits = new Set(["direct", "conditional", "none"]);
const requiredCiChecks = new Set([
  "json-ld-parse",
  "required-property-shape",
  "stable-at-id",
  "canonical-jsonld-url-agreement",
  "visible-content-comparison",
  "invalid-private-no-jsonld",
  "host-isolation",
  "safe-json-serialization",
]);
const requiredManualChecks = new Set([
  "schema-org-validator",
  "google-rich-results-test-for-supported-types",
  "search-console-enhancement-report-when-available",
  "deployed-raw-html-readback",
]);
const requiredReleaseBlockingFailures = new Set([
  "malformed-json-ld",
  "wrong-host-jsonld-url",
  "jsonld-canonical-og-url-mismatch",
  "hidden-or-fabricated-fact",
  "invalid-private-or-noindex-page-jsonld",
  "cross-dao-entity-contamination",
  "unsafe-json-serialization",
  "misleading-rich-result-type",
  "build-date-as-content-date",
  "unverified-same-as",
  "dataset-without-contract",
  "profile-without-privacy-policy",
]);
const requiredExplicitRejectionIds = new Set([
  "proposal-as-news-article",
  "faq-growth-strategy",
  "ratings-reviews-fake-freshness",
  "participant-profile-before-policy",
]);
const evidenceUrlPattern = /^https:\/\/github\.com\/ringecosystem\/.+/;

function assertFields(object, fields, label) {
  for (const field of fields) {
    assert.ok(Object.hasOwn(object, field), `${label} missing ${field}`);
  }
}

assert.equal(contract.version, 1);
assert.equal(contract.ownerIssue, "https://github.com/ringecosystem/degov/issues/1028");
assert.equal(contract.parentIssue, "https://github.com/ringecosystem/degov/issues/714");
assert.equal(
  contract.maintenance.contractPath,
  "docs/spec/seo-geo-structured-data-contract.json"
);
assert.equal(contract.maintenance.localCheck, "pnpm run test:seo-geo-structured-data");
assert.match(contract.maintenance.changeRule, /owner issue/);
assert.match(contract.maintenance.changeRule, /visible-content evidence/);
assert.match(contract.maintenance.changeRule, /rollback path/);

for (const sourceKey of requiredSourceKeys) {
  assert.equal(typeof contract.sourcePolicy[sourceKey], "string", `missing source ${sourceKey}`);
  assert.match(contract.sourcePolicy[sourceKey], /^https:\/\//, `invalid source ${sourceKey}`);
}
assert.match(contract.sourcePolicy.sourceUseRule, /Schema existence alone is not approval/);

assertFields(contract.entityIdentity.publisher, requiredPublisherFields, "publisher");
assert.equal(contract.entityIdentity.publisher.type, "Organization");
assert.equal(contract.entityIdentity.publisher.stableAtId, "https://degov.ai/#organization");
assert.equal(contract.entityIdentity.publisher.canonicalUrl, "https://degov.ai/");
for (const surface of requiredSurfaces) {
  assert.ok(
    contract.entityIdentity.publisher.surfaces.includes(surface),
    `publisher missing surface ${surface}`
  );
}
assert.match(contract.entityIdentity.publisher.sameAsPolicy, /Only verified/);
assert.equal(contract.entityIdentity.website.stableAtId, "https://degov.ai/#website");
assert.equal(contract.entityIdentity.website.publisherAtId, "https://degov.ai/#organization");

assertFields(contract.entityIdentity.daoEntityRule, requiredDaoRuleFields, "daoEntityRule");
assert.equal(contract.entityIdentity.daoEntityRule.type, "Organization");
assert.equal(contract.entityIdentity.daoEntityRule.stableAtIdPattern, "<dao.siteUrl>/#organization");
assert.match(contract.entityIdentity.daoEntityRule.sameAsPolicy, /verified/);
assert.match(contract.entityIdentity.daoEntityRule.hostIsolationRule, /Host header alone/);
assert.match(contract.entityIdentity.daoEntityRule.visibleContentRule, /visible/);
assert.match(contract.entityIdentity.urlAgreementRule, /HTML canonical, og:url, and sitemap URL/);
assert.match(contract.entityIdentity.localeRule, /visible localized page content/);

assert.equal(
  contract.pageClassDecisions.length,
  new Set(contract.pageClassDecisions.map((decision) => decision.id)).size,
  "page-class decision IDs must be unique"
);
const decisionIds = new Set(contract.pageClassDecisions.map((decision) => decision.id));
for (const decisionId of requiredDecisionIds) {
  assert.ok(decisionIds.has(decisionId), `missing page-class decision ${decisionId}`);
}

for (const decision of contract.pageClassDecisions) {
  assertFields(decision, requiredDecisionFields, decision.id);
  assert.ok(requiredSurfaces.has(decision.surface), `${decision.id} surface`);
  assert.ok(requiredRepositories.has(decision.repository), `${decision.id} repository`);
  assert.ok(Array.isArray(decision.candidateTypes), `${decision.id} candidateTypes`);
  assert.ok(decision.candidateTypes.length > 0, `${decision.id} candidateTypes`);
  assert.ok(allowedDecisions.has(decision.decision), `${decision.id} decision`);
  assert.ok(allowedSemanticFits.has(decision.schemaSemanticFit), `${decision.id} semantic fit`);
  assert.ok(decision.rationale.length > 60, `${decision.id} rationale`);
  assert.ok(decision.requiredVisibleEvidence.length > 0, `${decision.id} visible evidence`);
  assert.ok(decision.requiredProperties.length > 0, `${decision.id} required properties`);
  if (decision.decision.startsWith("approved")) {
    assert.ok(decision.validation.includes("json-ld-parse"), `${decision.id} must parse JSON-LD`);
  }
  assert.ok(decision.rollback.length > 40, `${decision.id} rollback`);
}

for (const decisionId of approvedOrConditionalIds) {
  const decision = contract.pageClassDecisions.find((item) => item.id === decisionId);
  assert.ok(
    decision.decision.startsWith("approved"),
    `${decisionId} should be approved or conditionally approved`
  );
  assert.notEqual(decision.schemaSemanticFit, "none", `${decisionId} semantic fit`);
  assert.ok(
    decision.validation.includes("visible-content-comparison") ||
      decision.validation.includes("breadcrumb-visible-content-comparison") ||
      decision.validation.includes("visible-itemlist-comparison") ||
      decision.validation.includes("proposal-visible-content-comparison"),
    `${decisionId} needs visible-content validation`
  );
}

for (const decisionId of deferredIds) {
  const decision = contract.pageClassDecisions.find((item) => item.id === decisionId);
  assert.equal(decision.decision, "deferred", `${decisionId} must remain deferred`);
}

const proposalDecision = contract.pageClassDecisions.find(
  (decision) => decision.id === "dao.proposal-detail"
);
for (const forbiddenType of [
  "Article",
  "NewsArticle",
  "Legislation",
  "DiscussionForumPosting",
]) {
  assert.ok(
    proposalDecision.forbiddenProperties.includes(forbiddenType),
    `proposal detail must forbid ${forbiddenType}`
  );
}

const homeDecision = contract.pageClassDecisions.find(
  (decision) => decision.id === "home.root"
);
assert.ok(homeDecision.requiredEntityProperties, "home.root must split entity properties");
assert.deepEqual(homeDecision.requiredEntityProperties.Organization, [
  "@id",
  "name",
  "url",
]);
assert.deepEqual(homeDecision.requiredEntityProperties.WebSite, [
  "@id",
  "name",
  "url",
  "publisher",
]);
assert.ok(
  !homeDecision.requiredProperties.includes("publisher"),
  "publisher must not be a shared home.root Organization/WebSite requirement"
);

const atlasDaoDecision = contract.pageClassDecisions.find(
  (decision) => decision.id === "atlas.dao-detail"
);
for (const breadcrumbField of ["itemListElement", "position", "name", "item"]) {
  assert.ok(
    atlasDaoDecision.requiredProperties.includes(breadcrumbField),
    `Atlas DAO breadcrumb mapping must require ${breadcrumbField}`
  );
}

const datasetDecision = contract.pageClassDecisions.find(
  (decision) => decision.id === "atlas.dataset"
);
for (const evidence of [
  "visible license",
  "visible creator/publisher",
  "distribution or access method",
  "provenance and data freshness",
]) {
  assert.ok(datasetDecision.requiredVisibleEvidence.includes(evidence));
}
assert.ok(datasetDecision.forbiddenProperties.includes("dataset-without-license"));
assert.ok(datasetDecision.validation.includes("dataset-contract-link"));

const profileDecision = contract.pageClassDecisions.find(
  (decision) => decision.id === "atlas.participant-profile"
);
assert.ok(profileDecision.requiredVisibleEvidence.includes("privacy-safe public value"));
assert.ok(profileDecision.validation.includes("privacy-review-link"));

assert.equal(
  contract.explicitRejections.length,
  new Set(contract.explicitRejections.map((rejection) => rejection.id)).size,
  "explicit rejection IDs must be unique"
);
const rejectionIds = new Set(contract.explicitRejections.map((rejection) => rejection.id));
for (const rejectionId of requiredExplicitRejectionIds) {
  assert.ok(rejectionIds.has(rejectionId), `missing explicit rejection ${rejectionId}`);
}
for (const rejection of contract.explicitRejections) {
  assert.ok(rejection.rejectedTypes.length > 0, `${rejection.id} rejectedTypes`);
  for (const rejectedType of rejection.rejectedTypes) {
    assert.match(rejectedType, /^[A-Z][A-Za-z]+$/, `${rejection.id} rejected type ${rejectedType}`);
  }
  assert.ok(rejection.reason.length > 60, `${rejection.id} reason`);
}

for (const check of requiredCiChecks) {
  assert.ok(contract.validationModel.ciChecks.includes(check), `missing CI check ${check}`);
}
for (const check of requiredManualChecks) {
  assert.ok(contract.validationModel.manualChecks.includes(check), `missing manual check ${check}`);
}
for (const failure of requiredReleaseBlockingFailures) {
  assert.ok(
    contract.validationModel.releaseBlockingFailures.includes(failure),
    `missing release-blocking failure ${failure}`
  );
}
assert.ok(contract.validationModel.informationalOnly.includes("schema-count"));
assert.ok(contract.validationModel.informationalOnly.includes("rich-result-not-shown"));
assert.match(contract.validationModel.rollbackProcedure, /Remove or disable/);

assert.equal(
  contract.repositoryFollowUps.length,
  new Set(contract.repositoryFollowUps.map((followUp) => followUp.repository)).size,
  "repository follow-up entries must be unique by repository"
);
const followUpRepositories = new Set(
  contract.repositoryFollowUps.map((followUp) => followUp.repository)
);
for (const repository of requiredRepositories) {
  assert.ok(followUpRepositories.has(repository), `missing follow-up for ${repository}`);
}
for (const followUp of contract.repositoryFollowUps) {
  assert.equal(followUp.status, "implementation-issue-required-after-contract");
  assert.ok(followUp.approvedScopes.length > 0, `${followUp.repository} approved scopes`);
  for (const scope of followUp.approvedScopes) {
    assert.ok(decisionIds.has(scope), `${followUp.repository} unknown scope ${scope}`);
  }
  assert.ok(followUp.scope.length > 80, `${followUp.repository} follow-up scope`);
}

assert.equal(typeof contract.completionState.contractApproved, "boolean");
assert.ok(Array.isArray(contract.completionState.contractApprovalEvidence));
assert.equal(typeof contract.completionState.implementationIssuesLinked, "boolean");
assert.ok(Array.isArray(contract.completionState.implementationIssueLinks));
assert.equal(typeof contract.completionState.officialSiteRecheckComplete, "boolean");
assert.ok(Array.isArray(contract.completionState.officialSiteRecheckEvidence));
assert.equal(typeof contract.completionState.validatorEvidenceComplete, "boolean");
assert.ok(Array.isArray(contract.completionState.validatorEvidenceRecords));
assert.match(contract.completionState.closeIssueWhen, /official-site JSON-LD is rechecked/);
assert.match(contract.completionState.closeIssueWhen, /#714 has the final evidence summary/);

if (contract.completionState.contractApproved) {
  assert.ok(
    contract.completionState.contractApprovalEvidence.length > 0,
    "contract approval requires evidence links"
  );
  for (const evidenceUrl of contract.completionState.contractApprovalEvidence) {
    assert.match(evidenceUrl, evidenceUrlPattern);
  }
}

if (contract.completionState.implementationIssuesLinked) {
  assert.ok(
    contract.completionState.implementationIssueLinks.length >= requiredRepositories.size,
    "linked implementation state requires one link per repository"
  );
  const linkedRepositories = new Set(
    contract.completionState.implementationIssueLinks.map((link) => link.repository)
  );
  for (const repository of requiredRepositories) {
    assert.ok(linkedRepositories.has(repository), `missing implementation link for ${repository}`);
  }
  for (const link of contract.completionState.implementationIssueLinks) {
    assert.match(link.url, evidenceUrlPattern, `${link.repository} link`);
  }
}

if (contract.completionState.officialSiteRecheckComplete) {
  assert.ok(
    contract.completionState.officialSiteRecheckEvidence.length > 0,
    "official-site recheck completion requires evidence"
  );
  for (const evidenceUrl of contract.completionState.officialSiteRecheckEvidence) {
    assert.match(evidenceUrl, evidenceUrlPattern);
  }
}

if (contract.completionState.validatorEvidenceComplete) {
  assert.ok(
    contract.completionState.validatorEvidenceRecords.length > 0,
    "validator completion requires evidence records"
  );
  for (const evidence of contract.completionState.validatorEvidenceRecords) {
    assert.ok(decisionIds.has(evidence.pageClassId), `unknown page class ${evidence.pageClassId}`);
    assert.match(evidence.url, evidenceUrlPattern, `${evidence.pageClassId} evidence URL`);
    assert.ok(evidence.validator.length > 0, `${evidence.pageClassId} validator`);
    assert.equal(evidence.result, "pass", `${evidence.pageClassId} validator result`);
  }
}

console.log(
  `SEO/GEO structured-data contract ok: ${contract.pageClassDecisions.length} page classes, ${contract.explicitRejections.length} rejections, ${contract.repositoryFollowUps.length} repository follow-ups`
);
