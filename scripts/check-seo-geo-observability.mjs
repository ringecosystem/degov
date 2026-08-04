import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(
  rootDir,
  "docs/spec/search-crawler-observability-baseline.json"
);
const contract = JSON.parse(readFileSync(contractPath, "utf8"));

const requiredSurfaceIds = new Set([
  "home",
  "docs",
  "square",
  "dao-sites",
  "atlas",
]);
const requiredMetricGroupIds = new Set([
  "canonical-indexing",
  "sitemap-processing",
  "query-landing-performance",
  "crawl-errors",
  "field-cwv",
  "bing-ai-performance",
]);
const requiredCrawlerPurposes = new Set([
  "search-index",
  "ai-search-reference",
  "user-triggered-fetch",
  "model-training",
  "social-preview",
  "normal-browser",
]);
const requiredLogFields = new Set([
  "timestamp",
  "host",
  "path",
  "status",
  "bytes",
  "latencyMs",
  "userAgent",
  "crawlerPurpose",
  "identityVerification",
  "cacheResult",
  "wafAction",
]);
const requiredAnnotationEvents = new Set([
  "release",
  "sitemap-submission",
  "robots-change",
  "cdn-waf-change",
  "content-release",
  "crawler-policy-change",
  "experiment-start",
  "experiment-stop",
]);
const requiredForbiddenSignals = new Set([
  "total-indexed-pages-only",
  "total-impressions-only",
  "crawler-hit-volume-only",
  "proprietary-geo-score-only",
]);
const accessStates = new Set([
  "access-gap",
  "known-present-unverified",
  "fragmented-unverified",
  "confirmed",
]);

assert.equal(contract.version, 1);
assert.equal(
  contract.ownerIssue,
  "https://github.com/ringecosystem/degov/issues/1024"
);
assert.equal(
  contract.parentIssue,
  "https://github.com/ringecosystem/degov/issues/714"
);
assert.ok(contract.maintenance.contractPath.endsWith(".json"));
assert.equal(contract.maintenance.localCheck, "pnpm run test:seo-geo-observability");

assert.ok(Array.isArray(contract.surfaceGroups));
assert.ok(Array.isArray(contract.metricGroups));
assert.ok(Array.isArray(contract.crawlerPurposes));
assert.ok(Array.isArray(contract.baselineReports));

const surfaceIds = new Set(contract.surfaceGroups.map((surface) => surface.id));
for (const surfaceId of requiredSurfaceIds) {
  assert.ok(surfaceIds.has(surfaceId), `missing surface ${surfaceId}`);
}

for (const surface of contract.surfaceGroups) {
  assert.match(surface.repository, /^ringecosystem\//);
  assert.ok(surface.ownerRole.length > 3, `${surface.id} ownerRole`);
  assert.ok(surface.primaryHost.length > 3, `${surface.id} primaryHost`);
  assert.ok(surface.searchConsole, `${surface.id} searchConsole`);
  assert.ok(surface.bingWebmaster, `${surface.id} bingWebmaster`);
  assert.ok(surface.analytics, `${surface.id} analytics`);
  assert.ok(surface.logs, `${surface.id} logs`);
  assert.ok(accessStates.has(surface.searchConsole.accessState));
  assert.ok(accessStates.has(surface.bingWebmaster.accessState));
  assert.ok(accessStates.has(surface.analytics.accessState));
  assert.ok(accessStates.has(surface.logs.accessState));
  assert.ok(Array.isArray(surface.searchConsole.requiredEvidence));
  assert.ok(surface.searchConsole.requiredEvidence.includes("ownership-state"));
  assert.ok(surface.searchConsole.requiredEvidence.includes("sitemap-processing"));
  assert.ok(surface.bingWebmaster.requiredEvidence.includes("ai-performance-availability"));
  assert.ok(Array.isArray(surface.sitemaps));
  assert.ok(surface.sitemaps.length > 0, `${surface.id} sitemaps`);

  for (const sitemap of surface.sitemaps) {
    assert.match(sitemap.url, /^https:\/\//);
    assert.ok(sitemap.submissionState.length > 0);
    assert.ok(sitemap.processingState.length > 0);
  }
}

const daoSurface = contract.surfaceGroups.find((surface) => surface.id === "dao-sites");
assert.ok(daoSurface.representativeHosts.includes("demo.degov.ai"));
assert.ok(daoSurface.representativeHosts.includes("lisk.degov.ai"));
assert.ok(
  daoSurface.analytics.ownerRole.includes("DAO owner"),
  "custom-domain DAO ownership must remain explicit"
);

const metricGroupIds = new Set(contract.metricGroups.map((metric) => metric.id));
for (const metricGroupId of requiredMetricGroupIds) {
  assert.ok(metricGroupIds.has(metricGroupId), `missing metric group ${metricGroupId}`);
}
for (const metric of contract.metricGroups) {
  assert.ok(Array.isArray(metric.requiredFields));
  assert.ok(metric.requiredFields.length >= 4);
  assert.ok(metric.interpretation.length > 30);
  assert.ok(metric.privacyClass.length > 0);
}

const logFields = new Set(contract.crawlerLogSchema.requiredFields);
for (const field of requiredLogFields) {
  assert.ok(logFields.has(field), `missing crawler log field ${field}`);
}
assert.ok(
  contract.crawlerLogSchema.identityRule.includes("User-Agent alone is unverified")
);
assert.ok(contract.crawlerLogSchema.storageRule.includes("Do not commit raw private logs"));

const crawlerPurposeIds = new Set(
  contract.crawlerPurposes.map((purpose) => purpose.id)
);
for (const purposeId of requiredCrawlerPurposes) {
  assert.ok(crawlerPurposeIds.has(purposeId), `missing crawler purpose ${purposeId}`);
}
for (const purpose of contract.crawlerPurposes) {
  assert.ok(Array.isArray(purpose.examples));
  assert.ok(purpose.examples.length > 0);
  assert.ok(purpose.expectedTreatment.length > 20);
}

const annotationEvents = new Set(contract.changeAnnotationModel.requiredEvents);
for (const event of requiredAnnotationEvents) {
  assert.ok(annotationEvents.has(event), `missing annotation event ${event}`);
}
assert.deepEqual(contract.changeAnnotationModel.comparisonWindowsDays, [7, 28, 90]);

const baselineReport = contract.baselineReports.find(
  (report) => report.id === "baseline-2026-08-04-public-readback"
);
assert.ok(baselineReport, "missing dated baseline report");
assert.equal(baselineReport.date, "2026-08-04");
assert.equal(baselineReport.result, "mixed");
assert.equal(
  baselineReport.linkedUmbrellaIssue,
  "https://github.com/ringecosystem/degov/issues/714"
);
assert.ok(Array.isArray(baselineReport.surfaceResults));
assert.ok(
  baselineReport.surfaceResults.some(
    (surface) => surface.surface === "dao-sites" && surface.status === "known-fail"
  ),
  "missing DAO known-fail baseline"
);
assert.equal(baselineReport.privatePlatformData.googleSearchConsole, "access-gap");
assert.equal(baselineReport.privatePlatformData.bingWebmasterTools, "access-gap");
assert.equal(baselineReport.privatePlatformData.cdnServerLogs, "access-gap");

const forbiddenSignals = new Set(contract.reportingRules.forbiddenSuccessSignals);
for (const signal of requiredForbiddenSignals) {
  assert.ok(forbiddenSignals.has(signal), `missing forbidden signal ${signal}`);
}
assert.ok(
  contract.reportingRules.privacyRules.some((rule) =>
    rule.includes("Do not commit credentials")
  )
);
assert.ok(
  contract.reportingRules.privacyRules.some((rule) =>
    rule.includes("Do not commit raw private logs")
  )
);

console.log(
  `SEO/GEO observability contract ok: ${contract.surfaceGroups.length} surfaces, ${contract.metricGroups.length} metric groups, ${contract.crawlerPurposes.length} crawler purposes`
);
