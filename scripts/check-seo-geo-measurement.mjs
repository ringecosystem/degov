import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(rootDir, "docs/spec/seo-geo-measurement-contract.json");
const contract = JSON.parse(readFileSync(contractPath, "utf8"));

const requiredSurfaces = new Set(["home", "docs", "square", "dao-sites", "atlas"]);
const requiredRepositories = new Set([
  "ringecosystem/degov",
  "ringecosystem/degov-agent-api",
  "ringecosystem/degov-docs",
  "ringecosystem/degov-home",
  "ringecosystem/degov-square",
]);
const requiredChannels = new Set([
  "organic-search",
  "paid-search",
  "social-organic",
  "direct-unknown",
  "documentation-referral",
  "cross-product-degov-referral",
  "ai-search-assistant-referral",
  "other-external-referral",
]);
const requiredJourneys = new Set([
  "home-to-product-engagement",
  "docs-meaningful-navigation",
  "square-to-dao-discovery",
  "dao-proposal-read",
  "proposal-to-governance-action",
  "atlas-to-source-navigation",
  "ai-social-engaged-visit",
]);
const requiredEventFields = new Set([
  "name",
  "product",
  "userAction",
  "triggeringCondition",
  "allowedParameters",
  "prohibitedSensitiveParameters",
  "conversionStatus",
  "deduplication",
  "consentRequirement",
  "owner",
  "retention",
  "testProcedure",
]);
const requiredSensitiveExclusions = new Set([
  "wallet_address",
  "ens_identity",
  "vote_choice",
  "token_balance",
  "voting_power_linked_to_person",
  "proposal_draft",
  "unpublished_proposal_text",
  "authentication_session_token",
  "oauth_state",
  "oauth_code",
  "email",
  "notification_destination",
  "private_profile_value",
  "settings_value",
  "full_query_string_with_sensitive_values",
]);
const requiredBaselineInputs = new Set([
  "current analytics tags and properties by surface",
  "current consent behavior by surface",
  "current organic social referral channel definitions",
  "cross-domain self-referral examples",
  "missing or duplicate event observations",
  "dated baseline owner",
]);
const requiredCiChecks = new Set([
  "contract-json-parse",
  "surface-inventory-coverage",
  "channel-definition-coverage",
  "candidate-journey-coverage",
  "cross-domain-attribution-decisions",
  "event-contract-completeness",
  "sensitive-exclusion-coverage",
  "baseline-plan-required",
  "follow-up-blockers",
  "report-contract-no-volume-only-success",
]);
const requiredManualChecks = new Set([
  "analytics-tag-readback",
  "consent-debug-readback",
  "event-debug-mode-readback",
  "cross-domain-attribution-test",
  "sensitive-payload-inspection",
  "qualified-conversion-report-readback",
]);
const requiredReleaseBlockingFailures = new Set([
  "wallet-address-in-event",
  "vote-choice-in-event",
  "token-balance-or-voting-power-in-event",
  "auth-token-or-oauth-secret-in-event",
  "private-profile-or-settings-in-event",
  "full-sensitive-query-string-in-event",
  "direct-unknown-inferred-as-ai",
  "cross-domain-self-referral-erases-source",
  "custom-dao-domain-measured-without-owner-approval",
  "instrumentation-before-baseline",
  "success-claim-based-only-on-sessions-tags-or-volume",
]);
const requiredReportDimensions = new Set([
  "landing_surface",
  "channel_group",
  "journey_id",
  "conversion_status",
  "consent_mode",
  "owner_scope",
]);
const requiredTopLevelArrays = new Set([
  "surfaceInventory",
  "channelDefinitions",
  "candidateJourneys",
  "eventContracts",
  "sensitiveExclusions",
  "repositoryFollowUps",
]);
const requiredTopLevelObjects = new Set([
  "maintenance",
  "sourcePolicy",
  "crossDomainAttribution",
  "baselinePlan",
  "reportContract",
  "validation",
]);

function assertArray(value, label) {
  assert.ok(Array.isArray(value), `${label} must be an array`);
}

function assertPlainObject(value, label) {
  assert.equal(typeof value, "object", `${label} must be an object`);
  assert.notEqual(value, null, `${label} must be an object`);
  assert.ok(!Array.isArray(value), `${label} must be an object`);
}

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
assert.equal(contract.ownerIssue, "https://github.com/ringecosystem/degov/issues/1031");
assert.equal(contract.parentIssue, "https://github.com/ringecosystem/degov/issues/714");
for (const field of requiredTopLevelArrays) {
  assertArray(contract[field], field);
}
for (const field of requiredTopLevelObjects) {
  assertPlainObject(contract[field], field);
}
assert.equal(contract.maintenance.contractPath, "docs/spec/seo-geo-measurement-contract.json");
assert.equal(contract.maintenance.localCheck, "pnpm run test:seo-geo-measurement");
assert.match(contract.maintenance.changeRule, /privacy review state/);
assert.match(contract.maintenance.closeIssueWhen, /qualified-conversion report/);
assert.match(contract.sourcePolicy.sourceUseRule, /Missing referrer data remains direct\/unknown/);

assertUnique(contract.surfaceInventory, "id", "surface inventory");
const surfaceIds = new Set(contract.surfaceInventory.map((surface) => surface.id));
for (const surface of requiredSurfaces) {
  assert.ok(surfaceIds.has(surface), `missing surface ${surface}`);
}
for (const surface of contract.surfaceInventory) {
  assert.ok(requiredRepositories.has(surface.repository), `${surface.id} repository`);
  assert.match(surface.representativeHost, /degov\.ai|DAO hosts/);
  assert.ok(surface.requiredMappingEvidence.includes("consent behavior"), `${surface.id} consent`);
  assert.ok(surface.requiredMappingEvidence.includes("retention policy"), `${surface.id} retention`);
}

assertUnique(contract.channelDefinitions, "id", "channel definitions");
const channelIds = new Set(contract.channelDefinitions.map((channel) => channel.id));
for (const channel of requiredChannels) {
  assert.ok(channelIds.has(channel), `missing channel ${channel}`);
}
for (const channel of contract.channelDefinitions) {
  assert.ok(channel.classificationRule.length > 50, `${channel.id} rule`);
  assert.ok(channel.allowedExamples.length > 0, `${channel.id} examples`);
  assert.ok(channel.forbiddenInference.length > 40, `${channel.id} forbidden inference`);
}
assert.match(
  contract.channelDefinitions.find((channel) => channel.id === "direct-unknown").forbiddenInference,
  /Do not infer/
);
assert.match(
  contract.channelDefinitions.find((channel) => channel.id === "ai-search-assistant-referral")
    .forbiddenInference,
  /Missing referrer data remains direct\/unknown/
);

assertUnique(contract.candidateJourneys, "id", "candidate journeys");
const journeyIds = new Set(contract.candidateJourneys.map((journey) => journey.id));
for (const journey of requiredJourneys) {
  assert.ok(journeyIds.has(journey), `missing journey ${journey}`);
}
for (const journey of contract.candidateJourneys) {
  assert.ok(
    requiredSurfaces.has(journey.surface) || journey.surface === "cross-product",
    `${journey.id} surface`
  );
  assert.ok(journey.decision.startsWith("approved"), `${journey.id} decision`);
  assert.ok(journey.userAction.length > 50, `${journey.id} action`);
  assert.ok(journey.privacyNotes.length > 50, `${journey.id} privacy notes`);
}

for (const decision of [
  "journeyDomains",
  "propertyDecision",
  "linkerDecision",
  "referralExclusionDecision",
  "customDaoDomainDecision",
  "optOutDecision",
  "deduplicationDecision",
]) {
  assert.ok(Object.hasOwn(contract.crossDomainAttribution, decision), `missing ${decision}`);
}
assert.match(contract.crossDomainAttribution.referralExclusionDecision, /preserve the original acquisition source/);
assert.match(contract.crossDomainAttribution.customDaoDomainDecision, /separate ownership boundaries/);

assertUnique(contract.eventContracts, "name", "event contracts");
assert.ok(contract.eventContracts.length >= requiredJourneys.size, "event contract coverage");
for (const event of contract.eventContracts) {
  assertFields(event, requiredEventFields, event.name);
  assert.ok(event.allowedParameters.includes("channel_group"), `${event.name} channel_group`);
  assert.ok(event.prohibitedSensitiveParameters.length > 0, `${event.name} prohibited parameters`);
  assert.match(event.consentRequirement, /consent|approved/);
  assert.match(event.retention, /retention/);
  assert.match(event.testProcedure, /Debug event readback|Debug event/);
}
const serializedEvents = JSON.stringify(contract.eventContracts);
for (const sensitiveValue of ["wallet_address", "vote_choice", "auth_token"]) {
  assert.match(serializedEvents, new RegExp(sensitiveValue), `missing event exclusion ${sensitiveValue}`);
}
assert.match(
  contract.eventContracts.find((event) => event.name === "degov_referred_engaged_visit")
    .testProcedure,
  /direct\/unknown is not reclassified as AI/
);

for (const exclusion of requiredSensitiveExclusions) {
  assert.ok(contract.sensitiveExclusions.includes(exclusion), `missing exclusion ${exclusion}`);
}

assert.equal(contract.baselinePlan.requiredBeforeInstrumentation, true);
for (const input of requiredBaselineInputs) {
  assert.ok(contract.baselinePlan.requiredInputs.includes(input), `missing baseline input ${input}`);
}
assert.match(contract.baselinePlan.storageRule, /before instrumentation changes/);
assert.match(contract.baselinePlan.analysisRule, /Do not treat total sessions/);

assert.equal(contract.repositoryFollowUps.length, requiredSurfaces.size);
for (const followUp of contract.repositoryFollowUps) {
  assert.ok(requiredRepositories.has(followUp.repository), `${followUp.surface} repository`);
  assert.ok(requiredSurfaces.has(followUp.surface), `${followUp.surface} surface`);
  assert.equal(followUp.issueRequired, true, `${followUp.surface} issue`);
  assert.equal(followUp.blocksClose, true, `${followUp.surface} close blocker`);
  assert.match(followUp.scope, /consent|owner|privacy|payload|retention/);
}

for (const dimension of requiredReportDimensions) {
  assert.ok(
    contract.reportContract.qualifiedConversionDimensions.includes(dimension),
    `missing report dimension ${dimension}`
  );
}
assert.ok(
  contract.reportContract.forbiddenSuccessClaims.includes("tag installed"),
  "tag presence cannot be success"
);
assert.ok(
  contract.reportContract.forbiddenSuccessClaims.includes("event volume increased"),
  "event volume cannot be success"
);
assert.ok(
  contract.reportContract.forbiddenSuccessClaims.includes("direct traffic assumed to be AI"),
  "direct traffic cannot be assumed AI"
);

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
assert.match(contract.validation.rollback, /Disable or revert/);
assert.match(contract.validation.rollback, /#714 rationale/);

console.log(
  `SEO/GEO measurement contract ok: ${contract.surfaceInventory.length} surfaces, ${contract.channelDefinitions.length} channels, ${contract.eventContracts.length} events`
);
