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
  "crawler-access-outcomes",
  "referral-qualified-visits",
]);
const metricRequirements = {
  "canonical-indexing": [
    "intendedCanonicalUrl",
    "indexedCanonicalUrl",
    "googleSelectedCanonicalUrl",
    "status",
    "lastObservedAt",
  ],
  "sitemap-processing": [
    "sitemapUrl",
    "submittedAt",
    "lastReadAt",
    "discoveredUrls",
    "indexedUrls",
    "errors",
  ],
  "query-landing-performance": [
    "surface",
    "queryClass",
    "landingPage",
    "clicks",
    "impressions",
    "ctr",
    "qualifiedVisits",
    "trueReferrerState",
    "directOrUnknownVisits",
    "window",
  ],
  "crawl-errors": [
    "surface",
    "host",
    "pathGroup",
    "crawlerPurpose",
    "identityVerification",
    "statusGroup",
    "errorType",
    "wafAction",
    "observationState",
    "count",
    "window",
  ],
  "field-cwv": ["surface", "pageTemplate", "metric", "p75", "source", "window"],
  "bing-ai-performance": [
    "surface",
    "availabilityState",
    "citationUrl",
    "groundingQuery",
    "window",
  ],
  "crawler-access-outcomes": [
    "surface",
    "host",
    "crawlerPurpose",
    "identityVerification",
    "statusGroup",
    "wafAction",
    "cacheResult",
    "observationState",
    "count",
    "window",
  ],
  "referral-qualified-visits": [
    "surface",
    "landingPage",
    "referrerClass",
    "trueReferrerState",
    "qualifiedVisits",
    "directOrUnknownVisits",
    "conversionEventState",
    "window",
  ],
};
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
const observationStates = new Set(["observed", "not-observed", "access-gap", "known-gap"]);
const requiredRetentionAggregationFields = new Set([
  "surface",
  "host",
  "crawlerPurpose",
  "identityVerification",
  "statusGroup",
  "wafAction",
  "window",
]);
const requiredRetentionRedactionRules = new Set([
  "remove-request-id-before-publication",
  "remove-user-level-identifiers",
  "remove-wallet-addresses",
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

assert.equal(
  contract.metricGroups.length,
  new Set(contract.metricGroups.map((metric) => metric.id)).size,
  "metric group IDs must be unique"
);
const metricGroupIds = new Set(contract.metricGroups.map((metric) => metric.id));
for (const metricGroupId of requiredMetricGroupIds) {
  assert.ok(metricGroupIds.has(metricGroupId), `missing metric group ${metricGroupId}`);
}
for (const metric of contract.metricGroups) {
  assert.ok(
    metricRequirements[metric.id],
    `unexpected metric group ${metric.id}`
  );
  assert.ok(Array.isArray(metric.requiredFields));
  assert.deepEqual(
    metric.requiredFields,
    metricRequirements[metric.id],
    `${metric.id} requiredFields`
  );
  assert.ok(metric.interpretation.length > 30);
  assert.ok(metric.privacyClass.length > 0);
}
const queryLandingMetric = contract.metricGroups.find(
  (metric) => metric.id === "query-landing-performance"
);
assert.ok(
  queryLandingMetric.interpretation.includes("real referrer"),
  "query landing interpretation must require real referrer attribution"
);
const crawlerAccessMetric = contract.metricGroups.find(
  (metric) => metric.id === "crawler-access-outcomes"
);
assert.ok(
  crawlerAccessMetric.interpretation.includes("unverified"),
  "crawler access interpretation must preserve unverified crawler identity"
);

const logFields = new Set(contract.crawlerLogSchema.requiredFields);
for (const field of requiredLogFields) {
  assert.ok(logFields.has(field), `missing crawler log field ${field}`);
}
assert.ok(
  contract.crawlerLogSchema.identityRule.includes("User-Agent alone is unverified")
);
assert.ok(contract.crawlerLogSchema.storageRule.includes("Do not commit raw private logs"));

assert.equal(contract.retentionPolicy.rawLogRetentionDays, 30);
assert.ok(
  contract.retentionPolicy.aggregateRetentionDays >= 365,
  "aggregate reports must support year-over-year comparison"
);
const retentionAggregationFields = new Set(
  contract.retentionPolicy.minimumAggregationFields
);
for (const field of requiredRetentionAggregationFields) {
  assert.ok(
    retentionAggregationFields.has(field),
    `missing retention aggregation field ${field}`
  );
}
const retentionRedactionRules = new Set(contract.retentionPolicy.redactionRules);
for (const rule of requiredRetentionRedactionRules) {
  assert.ok(retentionRedactionRules.has(rule), `missing redaction rule ${rule}`);
}
assert.match(
  contract.retentionPolicy.deletionRule,
  /Delete raw private logs/,
  "retention policy must require raw private log deletion"
);

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
assert.ok(
  Number.isFinite(Date.parse(baselineReport.collectionStartedAt)),
  "baseline report must record collectionStartedAt"
);
assert.ok(
  Number.isFinite(Date.parse(baselineReport.collectionEndedAt)),
  "baseline report must record collectionEndedAt"
);
assert.deepEqual(baselineReport.comparisonWindowsDays, [7, 28, 90]);
assert.ok(Array.isArray(baselineReport.collectionMethods));
assert.ok(baselineReport.collectionMethods.length >= 2);
const collectionMethodIds = new Set();
for (const method of baselineReport.collectionMethods) {
  assert.ok(!collectionMethodIds.has(method.id), `duplicate collection method ${method.id}`);
  collectionMethodIds.add(method.id);
  assert.ok(method.ownerRole.length > 3, `${method.id} ownerRole`);
  assert.ok(method.dataSource.length > 3, `${method.id} dataSource`);
  assert.ok(method.reproducibleStep.length > 20, `${method.id} reproducibleStep`);
  assert.match(method.evidenceLink, /^https:\/\/github\.com\/ringecosystem\/degov\//);
}
assert.ok(Array.isArray(baselineReport.surfaceResults));
assert.equal(
  baselineReport.surfaceResults.length,
  new Set(baselineReport.surfaceResults.map((surface) => surface.surface)).size,
  "baseline surface results must be unique"
);
const baselineSurfaceIds = new Set(
  baselineReport.surfaceResults.map((surface) => surface.surface)
);
for (const surfaceId of requiredSurfaceIds) {
  assert.ok(baselineSurfaceIds.has(surfaceId), `missing baseline surface ${surfaceId}`);
}
for (const surface of baselineReport.surfaceResults) {
  assert.ok(requiredSurfaceIds.has(surface.surface), `unexpected baseline surface ${surface.surface}`);
  assert.ok(surface.summary.length > 20, `${surface.surface} summary`);
  assert.ok(Array.isArray(surface.metricResults), `${surface.surface} metricResults`);
  assert.equal(
    surface.metricResults.length,
    new Set(surface.metricResults.map((metric) => metric.metric)).size,
    `${surface.surface} metric results must be unique`
  );
  const metricResultIds = new Set(
    surface.metricResults.map((metric) => metric.metric)
  );
  for (const metricGroupId of requiredMetricGroupIds) {
    assert.ok(
      metricResultIds.has(metricGroupId),
      `missing ${surface.surface} metric result ${metricGroupId}`
    );
  }
  for (const metric of surface.metricResults) {
    assert.ok(requiredMetricGroupIds.has(metric.metric), `unexpected metric result ${metric.metric}`);
    assert.ok(
      observationStates.has(metric.observationState),
      `${surface.surface}/${metric.metric} observationState`
    );
    assert.ok(metric.ownerRole.length > 3, `${surface.surface}/${metric.metric} ownerRole`);
    assert.ok(metric.dataSource.length > 3, `${surface.surface}/${metric.metric} dataSource`);
    assert.ok(
      collectionMethodIds.has(metric.collectionMethod),
      `${surface.surface}/${metric.metric} collectionMethod`
    );
    assert.match(
      metric.evidenceLink,
      /^https:\/\/github\.com\/ringecosystem\/degov\//,
      `${surface.surface}/${metric.metric} evidenceLink`
    );
  }
}
assert.ok(
  baselineReport.surfaceResults.some(
    (surface) => surface.surface === "dao-sites" && surface.status === "known-fail"
  ),
  "missing DAO known-fail baseline"
);
assert.equal(baselineReport.privatePlatformData.googleSearchConsole, "access-gap");
assert.equal(baselineReport.privatePlatformData.bingWebmasterTools, "access-gap");
assert.equal(baselineReport.privatePlatformData.cdnServerLogs, "access-gap");

assert.ok(Array.isArray(baselineReport.outcomeClaims));
assert.ok(baselineReport.outcomeClaims.length > 0, "missing outcome claims");
const claimRules = contract.reportingRules.claimRules;
assert.deepEqual(claimRules.requiredFields, ["claim", "basis", "limitations"]);
assert.equal(claimRules.successRequiresAtLeastTwoNonVanityEvidenceTypes, true);
assert.equal(claimRules.singleMetricSuccessForbidden, true);
const allowedOutcomeBasis = new Set(claimRules.allowedOutcomeBasis);
for (const outcomeClaim of baselineReport.outcomeClaims) {
  for (const field of claimRules.requiredFields) {
    assert.ok(
      Object.hasOwn(outcomeClaim, field),
      `outcome claim missing field ${field}`
    );
  }
  assert.ok(outcomeClaim.claim.length > 3);
  assert.ok(Array.isArray(outcomeClaim.basis));
  assert.ok(Array.isArray(outcomeClaim.limitations));
  for (const basis of outcomeClaim.basis) {
    assert.ok(allowedOutcomeBasis.has(basis), `unsupported outcome basis ${basis}`);
  }
  assert.ok(
    outcomeClaim.limitations.includes("no-ranking-or-traffic-impact-claim"),
    "baseline outcome claims must avoid ranking or traffic impact claims"
  );
}

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
