import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(rootDir, "docs/spec/seo-geo-ai-benchmark-contract.json");
const contract = JSON.parse(readFileSync(contractPath, "utf8"));

const requiredCohorts = new Set([
  "branded-product-understanding",
  "category-and-workflow",
  "entity-discovery",
  "evidence-and-comparison",
]);
const requiredQueryIds = new Set([
  "branded.what-is-degov",
  "branded.products",
  "workflow.governance-platform-capabilities",
  "workflow.proposal-lifecycle",
  "workflow.supported-chains",
  "workflow.indexing-delay",
  "entity.canonical-dao-site",
  "evidence.proposal-explanation",
  "evidence.objective-comparison",
  "evidence.atlas-methodology",
]);
const requiredRunFields = new Set([
  "query_id",
  "query_text",
  "locale",
  "provider",
  "product",
  "model_or_version_when_exposed",
  "search_or_browse_mode",
  "signed_in_state",
  "region_when_known",
  "executed_at",
  "repetition_number",
  "answer_evidence_location",
  "citations",
  "expected_claims",
  "authoritative_urls",
  "evaluator_notes",
  "limitations",
]);
const requiredProviderIds = new Set([
  "chatgpt-search",
  "perplexity",
  "copilot",
  "google-ai-mode-or-overview",
  "bing-ai-performance",
]);
const requiredDimensions = new Set([
  "factual-accuracy",
  "claim-support-accuracy",
  "canonical-citation-quality",
  "freshness",
  "task-usefulness",
]);
const requiredExperimentFields = new Set([
  "hypothesis",
  "affected_query_ids",
  "pre_change_baseline",
  "rollout_date",
  "material_confounders",
  "minimum_observation_window",
  "falsifying_result",
  "rollback_or_freeze_behavior",
  "raw_result_location",
]);
const requiredBaselineEvidence = new Set([
  "raw run records",
  "repetition count",
  "provider coverage",
  "scoring notes",
  "known limitations",
  "Bing AI Performance separated when available",
]);
const requiredCiChecks = new Set([
  "contract-json-parse",
  "query-set-coverage",
  "expected-claim-source-url-coverage",
  "run-record-schema",
  "provider-coverage-gaps",
  "evaluation-dimension-separation",
  "raw-evidence-traceability-rule",
  "experiment-template-completeness",
  "privacy-storage-rules",
  "baseline-not-claimed-before-run",
  "no-single-geo-score",
]);
const requiredManualChecks = new Set([
  "provider-terms-review",
  "raw-evidence-storage-approval",
  "baseline-run-readback",
  "citation-support-review",
  "bing-ai-performance-separate-report",
  "recurring-result-link-to-714",
]);
const requiredReleaseBlockingFailures = new Set([
  "missing-raw-evidence",
  "single-response-treated-as-trend",
  "single-geo-score-used-as-authority",
  "citation-treated-as-good-without-support",
  "direct-or-unknown-traffic-treated-as-ai-answer-exposure",
  "private-data-in-prompt-or-output-store",
  "provider-terms-ignored",
  "experiment-without-pre-change-baseline",
  "cloaked-content-for-models",
]);

function assertArray(value, label) {
  assert.ok(Array.isArray(value), `${label} must be an array`);
}

function assertPlainObject(value, label) {
  assert.equal(typeof value, "object", `${label} must be an object`);
  assert.notEqual(value, null, `${label} must be an object`);
  assert.ok(!Array.isArray(value), `${label} must be an object`);
}

function assertUnique(items, key, label) {
  assert.equal(
    items.length,
    new Set(items.map((item) => item[key])).size,
    `${label} must have unique ${key}`
  );
}

assert.equal(contract.version, 1);
assert.equal(contract.ownerIssue, "https://github.com/ringecosystem/degov/issues/1030");
assert.equal(contract.parentIssue, "https://github.com/ringecosystem/degov/issues/714");
for (const field of ["querySet", "providerCoverage", "evaluationDimensions"]) {
  assertArray(contract[field], field);
}
for (const field of [
  "maintenance",
  "sourcePolicy",
  "runRecordSchema",
  "scoringConstraints",
  "experimentTemplate",
  "privacyAndStorage",
  "baselineState",
  "validation",
]) {
  assertPlainObject(contract[field], field);
}
assert.equal(contract.maintenance.contractPath, "docs/spec/seo-geo-ai-benchmark-contract.json");
assert.equal(contract.maintenance.localCheck, "pnpm run test:seo-geo-ai-benchmark");
assert.match(contract.maintenance.closeIssueWhen, /at least one repeated baseline run/);
assert.match(contract.sourcePolicy.sourceUseRule, /not automatically a good citation/);

assert.ok(contract.querySet.length >= 5, "query set must include at least 5 queries");
assertUnique(contract.querySet, "id", "query set");
const queryIds = new Set(contract.querySet.map((query) => query.id));
for (const queryId of requiredQueryIds) {
  assert.ok(queryIds.has(queryId), `missing query ${queryId}`);
}
const cohorts = new Set(contract.querySet.map((query) => query.cohort));
for (const cohort of requiredCohorts) {
  assert.ok(cohorts.has(cohort), `missing cohort ${cohort}`);
}
for (const query of contract.querySet) {
  assert.ok(query.query.length > 10, `${query.id} query`);
  assert.ok(query.expectedClaims.length > 0, `${query.id} expected claims`);
  assert.ok(query.authoritativeUrls.length > 0, `${query.id} URLs`);
  for (const url of query.authoritativeUrls) {
    assert.match(url, /^https:\/\//, `${query.id} invalid URL ${url}`);
  }
  assert.equal(typeof query.avoidForcedMention, "boolean", `${query.id} forced mention flag`);
}

for (const field of requiredRunFields) {
  assert.ok(contract.runRecordSchema.requiredFields.includes(field), `missing run field ${field}`);
}
assert.ok(
  contract.runRecordSchema.repetitionProcedure.minimumRepetitionsPerQuery >= 3,
  "minimum repetitions"
);
assert.match(contract.runRecordSchema.repetitionProcedure.providerTermsRule, /provider terms/);
assert.match(contract.runRecordSchema.rawEvidenceRule, /Preserve answer text/);

assertUnique(contract.providerCoverage, "id", "provider coverage");
const providerIds = new Set(contract.providerCoverage.map((provider) => provider.id));
for (const providerId of requiredProviderIds) {
  assert.ok(providerIds.has(providerId), `missing provider ${providerId}`);
}
assert.equal(
  contract.providerCoverage.find((provider) => provider.id === "bing-ai-performance").status,
  "separate-channel-report"
);

assertUnique(contract.evaluationDimensions, "id", "evaluation dimensions");
const dimensionIds = new Set(contract.evaluationDimensions.map((dimension) => dimension.id));
for (const dimensionId of requiredDimensions) {
  assert.ok(dimensionIds.has(dimensionId), `missing dimension ${dimensionId}`);
}
for (const dimension of contract.evaluationDimensions) {
  assert.ok(dimension.allowedScores.length >= 3, `${dimension.id} scores`);
  assert.ok(dimension.rule.length > 50, `${dimension.id} rule`);
}

assert.match(contract.scoringConstraints.traceabilityRule, /raw run evidence/);
assert.match(contract.scoringConstraints.noSingleScoreRule, /one proprietary GEO visibility score/);
assert.match(contract.scoringConstraints.citationRule, /not automatically good/);
assert.match(contract.scoringConstraints.nonCitationRule, /not automatically a failure/);

for (const field of requiredExperimentFields) {
  assert.ok(contract.experimentTemplate.requiredFields.includes(field), `missing experiment field ${field}`);
}
assert.ok(contract.experimentTemplate.allowedExperimentTypes.includes("llms-txt"));
assert.match(contract.experimentTemplate.cloakingRule, /Do not serve different hidden content/);

assert.ok(contract.privacyAndStorage.prohibitedInputs.includes("credentials"));
assert.ok(contract.privacyAndStorage.prohibitedInputs.includes("wallet secrets"));
assert.ok(contract.privacyAndStorage.prohibitedInputs.includes("draft proposals"));
assert.match(contract.privacyAndStorage.storageRule, /approved location/);
assert.match(contract.privacyAndStorage.automationRule, /provider terms/);

assert.equal(contract.baselineState.firstBaselineStatus, "not-run");
assert.equal(contract.baselineState.requiredBeforeExperimentClaims, true);
for (const evidence of requiredBaselineEvidence) {
  assert.ok(contract.baselineState.requiredEvidence.includes(evidence), `missing baseline evidence ${evidence}`);
}
assert.match(contract.baselineState.linkBackRule, /linked to #714/);

for (const check of requiredCiChecks) {
  assert.ok(contract.validation.ciChecks.includes(check), `missing CI check ${check}`);
}
for (const check of requiredManualChecks) {
  assert.ok(contract.validation.manualChecks.includes(check), `missing manual check ${check}`);
}
for (const failure of requiredReleaseBlockingFailures) {
  assert.ok(contract.validation.releaseBlockingFailures.includes(failure), `missing failure ${failure}`);
}
assert.match(contract.validation.rollback, /Discard or quarantine/);
assert.match(contract.validation.rollback, /Do not use invalid results/);

console.log(
  `SEO/GEO AI benchmark contract ok: ${contract.querySet.length} queries, ${contract.providerCoverage.length} providers, ${contract.evaluationDimensions.length} dimensions`
);
