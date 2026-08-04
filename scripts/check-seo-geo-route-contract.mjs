import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(
  rootDir,
  "docs/spec/seo-geo-route-contract.json"
);
const contract = JSON.parse(readFileSync(contractPath, "utf8"));

const requiredProductIds = new Set([
  "home",
  "docs",
  "square",
  "dao-site",
  "atlas",
]);
const requiredRepositories = new Set([
  "ringecosystem/degov",
  "ringecosystem/degov-agent-api",
  "ringecosystem/degov-docs",
  "ringecosystem/degov-home",
  "ringecosystem/degov-square",
]);
const productRepositories = new Map([
  ["home", "ringecosystem/degov-home"],
  ["docs", "ringecosystem/degov-docs"],
  ["square", "ringecosystem/degov-square"],
  ["dao-site", "ringecosystem/degov"],
  ["atlas", "ringecosystem/degov-agent-api"],
]);
const requiredRouteIds = new Set([
  "home.root",
  "home.pricing",
  "docs.home",
  "docs.nested-page",
  "square.home-directory",
  "square.account-settings",
  "dao.home",
  "dao.proposal-directory",
  "dao.proposal-detail-valid",
  "dao.proposal-detail-invalid",
  "dao.delegates-treasury-deferred",
  "dao.private-editor-profile-ai",
  "dao.robots",
  "dao.sitemap",
  "dao.preview-staging",
  "atlas.home",
  "atlas.dao-directory",
  "atlas.dao-detail-valid",
  "atlas.governance",
  "atlas.excluded-dynamic-routes",
]);
const requiredCaseTypes = new Set([
  "valid",
  "invalid",
  "lagging-indexer",
  "temporary-failure",
  "private",
  "transactional",
  "locale",
  "query-filter",
  "redirect",
  "authentication",
  "editor",
  "staging",
]);
const requiredP0Fields = [
  "id",
  "product",
  "repository",
  "ownerIssue",
  "priority",
  "caseTypes",
  "fixtureUrl",
  "canonicalPattern",
  "intent",
  "expectedStatus",
  "expectedContentType",
  "indexPolicy",
  "rawContentRequirement",
  "sitemap",
  "localePolicy",
  "metadata",
  "structuredData",
  "checks",
  "releaseBlockingAssertions",
  "dryRun",
];
const requiredReleaseBlockingAssertions = new Set([
  "wrong-host-canonical-or-og-url",
  "approved-public-route-noindex",
  "approved-public-route-loading-shell",
  "invalid-resource-indexable-thin-200",
  "sitemap-invalid-redirected-noindex-or-wrong-host-url",
  "robots-or-sitemap-html-shell",
  "malformed-json-ld",
  "inaccessible-or-wrong-host-social-image",
  "cross-tenant-content-or-metadata-contamination",
  "lastmod-not-backed-by-content-change",
  "dynamic-metadata-jsonld-unsafe-escaping",
  "cross-tenant-sitemap-contamination",
]);
const expectedInformationalAssertions = new Set([
  "external-indexing-state",
  "search-ranking",
  "field-core-web-vitals",
  "ai-citation-frequency",
  "social-platform-cache-state",
]);
const routeRequirements = {
  "home.root": {
    fixtureUrl: "https://degov.ai/",
    canonicalPattern: "https://degov.ai/",
    indexPolicy: "index",
    sitemap: "include",
    metadataRequired: ["title", "description", "canonical", "og:url", "og:image", "twitter:card"],
    checksCi: ["raw-head", "json-ld-parse", "sitemap-entry"],
    releaseBlockingAssertions: [
      "wrong-host-canonical-or-og-url",
      "approved-public-route-noindex",
      "approved-public-route-loading-shell",
      "malformed-json-ld",
      "inaccessible-or-wrong-host-social-image",
    ],
  },
  "home.pricing": {
    fixtureUrl: "https://degov.ai/pricing",
    canonicalPattern: "https://degov.ai/pricing",
    indexPolicy: "index",
    sitemap: "include-after-degov-home-pr-31-deploy",
    metadataRequired: ["title", "description", "canonical", "og:url", "og:image", "twitter:card"],
    checksCi: ["raw-head", "json-ld-parse", "sitemap-entry-after-deploy"],
    releaseBlockingAssertions: [
      "wrong-host-canonical-or-og-url",
      "approved-public-route-noindex",
      "approved-public-route-loading-shell",
      "malformed-json-ld",
      "inaccessible-or-wrong-host-social-image",
    ],
  },
  "docs.home": {
    fixtureUrl: "https://docs.degov.ai/",
    canonicalPattern: "https://docs.degov.ai/",
    indexPolicy: "index",
    sitemap: "include",
    metadataRequired: ["title", "description", "canonical"],
    checksCi: ["mkdocs-build", "canonical-host", "sitemap-xml"],
    releaseBlockingAssertions: ["wrong-host-canonical-or-og-url", "sitemap-invalid-redirected-noindex-or-wrong-host-url"],
  },
  "docs.nested-page": {
    fixtureUrl: "https://docs.degov.ai/user-guide/",
    canonicalPattern: "https://docs.degov.ai/<docs-path>/",
    indexPolicy: "index",
    sitemap: "include",
    metadataRequired: ["title", "canonical"],
    checksCi: ["mkdocs-build", "canonical-host", "sitemap-entry"],
    releaseBlockingAssertions: ["wrong-host-canonical-or-og-url", "approved-public-route-noindex"],
  },
  "square.home-directory": {
    fixtureUrl: "https://square.degov.ai/",
    canonicalPattern: "https://square.degov.ai/",
    indexPolicy: "index",
    sitemap: "include-home-only",
    metadataRequired: ["title", "description", "canonical", "og:url", "og:image", "twitter:card"],
    checksCi: ["raw-html-directory", "metadata-contract", "metadata-safe-escaping", "safe-fallback"],
    releaseBlockingAssertions: [
      "wrong-host-canonical-or-og-url",
      "approved-public-route-loading-shell",
      "dynamic-metadata-jsonld-unsafe-escaping",
      "inaccessible-or-wrong-host-social-image",
    ],
  },
  "square.account-settings": {
    fixtureUrl: "https://square.degov.ai/settings",
    canonicalPattern: "none",
    indexPolicy: "noindex",
    sitemap: "exclude",
    metadataRequired: ["robots:noindex"],
    checksCi: ["noindex", "sitemap-exclusion"],
    releaseBlockingAssertions: [
      "sitemap-invalid-redirected-noindex-or-wrong-host-url",
      "cross-tenant-content-or-metadata-contamination",
    ],
  },
  "dao.home": {
    fixtureUrl: "https://demo.degov.ai/",
    additionalFixtureUrls: ["https://lisk.degov.ai/"],
    canonicalPattern: "<dao.siteUrl>/",
    indexPolicy: "index",
    sitemap: "include",
    metadataRequired: ["title", "description", "canonical", "og:url", "og:image", "twitter:card"],
    checksCi: ["raw-html-summary", "metadata-contract", "host-isolation-body-metadata-canonical"],
    releaseBlockingAssertions: [
      "wrong-host-canonical-or-og-url",
      "approved-public-route-loading-shell",
      "cross-tenant-content-or-metadata-contamination",
      "dynamic-metadata-jsonld-unsafe-escaping",
    ],
  },
  "dao.proposal-directory": {
    fixtureUrl: "https://demo.degov.ai/proposals",
    additionalFixtureUrls: ["https://lisk.degov.ai/proposals"],
    canonicalPattern: "<dao.siteUrl>/proposals",
    indexPolicy: "index",
    sitemap: "include",
    metadataRequired: ["title", "description", "canonical", "og:url", "og:image", "twitter:card"],
    checksCi: ["raw-html-summary", "metadata-contract", "query-canonical-collapse"],
    releaseBlockingAssertions: [
      "wrong-host-canonical-or-og-url",
      "approved-public-route-loading-shell",
      "dynamic-metadata-jsonld-unsafe-escaping",
    ],
  },
  "dao.proposal-detail-valid": {
    fixtureUrl: "https://demo.degov.ai/proposal/1",
    additionalFixtureUrls: [
      "https://lisk.degov.ai/proposal/0xb1318bd67737f2fe8a918bfd691ac5e69e174a0c9455bcc36b80a3ccc7caa878",
    ],
    canonicalPattern: "<dao.siteUrl>/proposal/<proposalId>",
    indexPolicy: "index",
    sitemap: "include-valid-only",
    metadataRequired: ["title", "description", "canonical", "og:url", "og:image", "twitter:card"],
    checksCi: ["raw-html-summary", "metadata-contract", "sitemap-valid-proposal-only"],
    releaseBlockingAssertions: [
      "wrong-host-canonical-or-og-url",
      "approved-public-route-loading-shell",
      "sitemap-invalid-redirected-noindex-or-wrong-host-url",
      "dynamic-metadata-jsonld-unsafe-escaping",
    ],
  },
  "dao.proposal-detail-invalid": {
    fixtureUrl: "https://demo.degov.ai/proposal/not-a-number",
    canonicalPattern: "none-for-invalid",
    indexPolicy: "noindex-or-not-found",
    sitemap: "exclude",
    metadataRequired: ["robots:noindex-or-404"],
    checksCi: ["invalid-id-not-found", "lagging-indexer-not-false-404"],
    releaseBlockingAssertions: ["invalid-resource-indexable-thin-200", "sitemap-invalid-redirected-noindex-or-wrong-host-url"],
  },
  "dao.delegates-treasury-deferred": {
    fixtureUrl: "https://demo.degov.ai/delegates",
    additionalFixtureUrls: ["https://demo.degov.ai/treasury", "https://lisk.degov.ai/delegates"],
    canonicalPattern: "<dao.siteUrl>/<delegates-or-treasury>",
    indexPolicy: "exclude-until-baseline-validates-public-value",
    sitemap: "exclude-until-validated",
    metadataRequired: ["robots:noindex-until-approved", "no-sitemap-entry"],
    checksCi: ["sitemap-exclusion", "host-isolation-body-metadata-canonical"],
    releaseBlockingAssertions: [
      "sitemap-invalid-redirected-noindex-or-wrong-host-url",
      "cross-tenant-content-or-metadata-contamination",
      "cross-tenant-sitemap-contamination",
    ],
  },
  "dao.private-editor-profile-ai": {
    fixtureUrl: "https://demo.degov.ai/proposals/new",
    canonicalPattern: "none",
    indexPolicy: "noindex",
    sitemap: "exclude",
    metadataRequired: ["robots:noindex"],
    checksCi: ["noindex", "localized-noindex", "sitemap-exclusion"],
    releaseBlockingAssertions: [
      "sitemap-invalid-redirected-noindex-or-wrong-host-url",
      "cross-tenant-content-or-metadata-contamination",
    ],
  },
  "dao.robots": {
    fixtureUrl: "https://demo.degov.ai/robots.txt",
    additionalFixtureUrls: ["https://lisk.degov.ai/robots.txt"],
    canonicalPattern: "<dao.siteUrl>/robots.txt",
    indexPolicy: "not-page",
    sitemap: "not-applicable",
    checksCi: ["robots-text", "sitemap-declaration", "not-html-shell"],
    releaseBlockingAssertions: ["robots-or-sitemap-html-shell", "wrong-host-canonical-or-og-url"],
  },
  "dao.sitemap": {
    fixtureUrl: "https://demo.degov.ai/sitemap.xml",
    additionalFixtureUrls: ["https://lisk.degov.ai/sitemap.xml"],
    canonicalPattern: "<dao.siteUrl>/sitemap.xml",
    indexPolicy: "not-page",
    sitemap: "not-applicable",
    checksCi: ["sitemap-xml-parse", "not-html-shell", "lastmod-real-content-change", "host-local-urls-only"],
    releaseBlockingAssertions: [
      "robots-or-sitemap-html-shell",
      "lastmod-not-backed-by-content-change",
      "cross-tenant-sitemap-contamination",
      "sitemap-invalid-redirected-noindex-or-wrong-host-url",
    ],
  },
  "dao.preview-staging": {
    fixtureUrl: "https://degov-dev.vercel.app/",
    canonicalPattern: "none-or-production-canonical-only",
    indexPolicy: "noindex-or-excluded",
    sitemap: "exclude",
    metadataRequired: ["no-production-sitemap-entry"],
    checksCi: ["host-source-validation"],
    releaseBlockingAssertions: ["wrong-host-canonical-or-og-url", "sitemap-invalid-redirected-noindex-or-wrong-host-url"],
  },
  "atlas.home": {
    fixtureUrl: "https://atlas.degov.ai/",
    canonicalPattern: "https://atlas.degov.ai/",
    indexPolicy: "index",
    sitemap: "include",
    metadataRequired: ["title", "description", "canonical", "og:url", "og:image", "twitter:card"],
    checksCi: ["metadata-contract", "sitemap-entry"],
    releaseBlockingAssertions: ["wrong-host-canonical-or-og-url", "approved-public-route-noindex"],
  },
  "atlas.dao-directory": {
    fixtureUrl: "https://atlas.degov.ai/daos",
    canonicalPattern: "https://atlas.degov.ai/daos",
    indexPolicy: "index",
    sitemap: "include",
    metadataRequired: ["title", "description", "canonical", "og:url", "og:image", "twitter:card"],
    checksCi: ["metadata-contract", "metadata-safe-escaping", "sitemap-entry", "query-canonical-collapse"],
    releaseBlockingAssertions: [
      "wrong-host-canonical-or-og-url",
      "approved-public-route-noindex",
      "approved-public-route-loading-shell",
      "dynamic-metadata-jsonld-unsafe-escaping",
      "sitemap-invalid-redirected-noindex-or-wrong-host-url",
    ],
  },
  "atlas.dao-detail-valid": {
    fixtureUrl: "https://atlas.degov.ai/daos/<daoId>",
    canonicalPattern: "https://atlas.degov.ai/daos/<daoId>",
    indexPolicy: "index",
    sitemap: "include-valid-only",
    metadataRequired: ["title", "description", "canonical", "og:url", "og:image", "twitter:card"],
    checksCi: ["valid-dao-metadata", "metadata-safe-escaping", "invalid-dao-not-indexable", "sitemap-entry"],
    releaseBlockingAssertions: [
      "wrong-host-canonical-or-og-url",
      "dynamic-metadata-jsonld-unsafe-escaping",
      "sitemap-invalid-redirected-noindex-or-wrong-host-url",
    ],
  },
  "atlas.governance": {
    fixtureUrl: "https://atlas.degov.ai/governance",
    canonicalPattern: "https://atlas.degov.ai/governance",
    indexPolicy: "index",
    sitemap: "include",
    metadataRequired: ["title", "description", "canonical", "og:url", "og:image", "twitter:card"],
    checksCi: ["metadata-contract", "metadata-safe-escaping", "sitemap-entry", "query-canonical-collapse"],
    releaseBlockingAssertions: [
      "wrong-host-canonical-or-og-url",
      "approved-public-route-noindex",
      "dynamic-metadata-jsonld-unsafe-escaping",
    ],
  },
  "atlas.excluded-dynamic-routes": {
    fixtureUrl: "https://atlas.degov.ai/participants/<participantId>",
    canonicalPattern: "none",
    indexPolicy: "exclude",
    sitemap: "exclude",
    metadataRequired: ["no-sitemap-entry"],
    checksCi: ["sitemap-exclusion", "invalid-route-not-indexable"],
    releaseBlockingAssertions: ["invalid-resource-indexable-thin-200", "sitemap-invalid-redirected-noindex-or-wrong-host-url"],
  },
};

assert.equal(contract.version, 1);
assert.equal(
  contract.ownerIssue,
  "https://github.com/ringecosystem/degov/issues/1025"
);
assert.ok(Array.isArray(contract.products));
assert.ok(Array.isArray(contract.repositoryPlans));
assert.ok(Array.isArray(contract.routeClasses));
assert.ok(Array.isArray(contract.dryRunEvidence));
assert.ok(contract.routeClasses.length >= requiredRouteIds.size);
assert.ok(contract.assertionTiers.releaseBlocking.length > 0);
assert.ok(contract.assertionTiers.informational.length > 0);

const productIds = new Set(contract.products.map((product) => product.id));
for (const productId of requiredProductIds) {
  assert.ok(productIds.has(productId), `missing product ${productId}`);
}

const releaseBlockingAssertions = new Set(contract.assertionTiers.releaseBlocking);
for (const assertion of requiredReleaseBlockingAssertions) {
  assert.ok(
    releaseBlockingAssertions.has(assertion),
    `missing release-blocking assertion ${assertion}`
  );
}
const informationalAssertions = new Set(contract.assertionTiers.informational);
for (const assertion of expectedInformationalAssertions) {
  assert.ok(
    informationalAssertions.has(assertion),
    `missing informational assertion ${assertion}`
  );
}

const routeProducts = new Set();
const routeCaseTypes = new Set();
const routeIds = new Set();
const dryRunStatuses = new Set();

for (const routeClass of contract.routeClasses) {
  assert.ok(!routeIds.has(routeClass.id), `duplicate route id ${routeClass.id}`);
  routeIds.add(routeClass.id);
  routeProducts.add(routeClass.product);
  assert.equal(
    routeClass.repository,
    productRepositories.get(routeClass.product),
    `${routeClass.id} repository does not match product`
  );
  assert.ok(Array.isArray(routeClass.caseTypes), `${routeClass.id} caseTypes`);
  assert.ok(routeClass.caseTypes.length > 0, `${routeClass.id} caseTypes empty`);
  for (const caseType of routeClass.caseTypes) routeCaseTypes.add(caseType);
  assert.ok(routeClass.dryRun, `${routeClass.id} missing dryRun`);
  dryRunStatuses.add(routeClass.dryRun.status);

  if (requiredRouteIds.has(routeClass.id)) {
    assert.equal(routeClass.priority, "P0", `${routeClass.id} priority`);
    for (const field of requiredP0Fields) {
      assert.ok(
        Object.hasOwn(routeClass, field),
        `${routeClass.id} missing ${field}`
      );
    }
    assert.ok(productIds.has(routeClass.product), `${routeClass.id} product`);
    assert.match(routeClass.ownerIssue, /^https:\/\/github\.com\//);
    assert.ok(routeClass.rawContentRequirement.length > 20);
    assert.ok(Array.isArray(routeClass.metadata.required));
    assert.ok(Array.isArray(routeClass.checks.ci));
    assert.ok(Array.isArray(routeClass.checks.preview));
    assert.ok(Array.isArray(routeClass.checks.postDeploy));
    assert.ok(routeClass.releaseBlockingAssertions.length > 0);
    assert.match(
      routeClass.dryRun.status,
      /^(pass-after-fix|not-run|known-fail|known-gap|informational-only)$/
    );

    for (const assertion of routeClass.releaseBlockingAssertions) {
      assert.ok(
        releaseBlockingAssertions.has(assertion),
        `${routeClass.id} has unknown release-blocking assertion ${assertion}`
      );
    }
  }
}

for (const productId of requiredProductIds) {
  assert.ok(routeProducts.has(productId), `missing route for ${productId}`);
}

for (const caseType of requiredCaseTypes) {
  assert.ok(routeCaseTypes.has(caseType), `missing case type ${caseType}`);
}

for (const routeId of requiredRouteIds) {
  assert.ok(routeIds.has(routeId), `missing route class ${routeId}`);
}

assert.ok(dryRunStatuses.has("pass-after-fix"), "missing dry-run pass result");
assert.ok(dryRunStatuses.has("not-run"), "missing pending dry-run result");

const routeById = new Map(
  contract.routeClasses.map((routeClass) => [routeClass.id, routeClass])
);

function assertIncludesAll(actual, expected, label) {
  const actualSet = new Set(actual ?? []);
  for (const value of expected ?? []) {
    assert.ok(actualSet.has(value), `${label} missing ${value}`);
  }
}

for (const [routeId, requirement] of Object.entries(routeRequirements)) {
  const routeClass = routeById.get(routeId);
  assert.ok(routeClass, `missing route requirement target ${routeId}`);
  assert.equal(routeClass.fixtureUrl, requirement.fixtureUrl, `${routeId} fixtureUrl`);
  assert.equal(
    routeClass.canonicalPattern,
    requirement.canonicalPattern,
    `${routeId} canonicalPattern`
  );
  assert.equal(routeClass.indexPolicy, requirement.indexPolicy, `${routeId} indexPolicy`);
  assert.equal(routeClass.sitemap, requirement.sitemap, `${routeId} sitemap`);
  assertIncludesAll(
    routeClass.additionalFixtureUrls,
    requirement.additionalFixtureUrls,
    `${routeId} additionalFixtureUrls`
  );
  assertIncludesAll(
    routeClass.metadata.required,
    requirement.metadataRequired,
    `${routeId} metadata.required`
  );
  assertIncludesAll(routeClass.checks.ci, requirement.checksCi, `${routeId} checks.ci`);
  assertIncludesAll(
    routeClass.releaseBlockingAssertions,
    requirement.releaseBlockingAssertions,
    `${routeId} releaseBlockingAssertions`
  );
}

assert.ok(
  routeById.get("dao.home").dryRun.notes.includes("wrong-host social URL"),
  "missing demo.degov.ai wrong-host social regression fixture"
);
assert.equal(routeById.get("dao.robots").fixtureUrl, "https://demo.degov.ai/robots.txt");
assert.equal(routeById.get("dao.robots").expectedContentType, "text/plain");
assert.ok(routeById.get("dao.robots").checks.ci.includes("robots-text"));
assert.equal(routeById.get("dao.sitemap").fixtureUrl, "https://demo.degov.ai/sitemap.xml");
assert.equal(routeById.get("dao.sitemap").expectedContentType, "application/xml");
assert.ok(routeById.get("dao.sitemap").checks.ci.includes("sitemap-xml-parse"));
assert.ok(routeById.get("dao.sitemap").checks.ci.includes("lastmod-real-content-change"));
assert.ok(
  routeById
    .get("dao.sitemap")
    .releaseBlockingAssertions.includes("robots-or-sitemap-html-shell"),
  "missing fake-200 sitemap regression fixture"
);
assert.ok(
  routeById.get("dao.home").additionalFixtureUrls.includes("https://lisk.degov.ai/"),
  "missing second DAO host fixture"
);
assert.ok(
  routeById
    .get("dao.home")
    .releaseBlockingAssertions.includes("dynamic-metadata-jsonld-unsafe-escaping"),
  "missing DAO metadata/JSON-LD escaping assertion"
);
assert.ok(
  routeById
    .get("dao.delegates-treasury-deferred")
    .releaseBlockingAssertions.includes("cross-tenant-sitemap-contamination"),
  "missing deferred DAO route isolation assertion"
);

for (const plan of contract.repositoryPlans) {
  assert.match(plan.repository, /^ringecosystem\//);
  assert.ok(plan.ci.length > 20);
  assert.ok(plan.preview.length > 20);
  assert.ok(plan.postDeploy.length > 20);
}

const plannedRepositories = new Set(
  contract.repositoryPlans.map((plan) => plan.repository)
);
for (const repository of requiredRepositories) {
  assert.ok(
    plannedRepositories.has(repository),
    `missing repository plan for ${repository}`
  );
}

assert.ok(contract.dryRunEvidence.length > 0, "missing dry-run evidence");
assert.ok(
  contract.dryRunEvidence.some(
    (dryRun) => dryRun.level === "public-http-readback" && dryRun.result === "mixed"
  ),
  "missing mixed public fixture dry-run evidence"
);
for (const dryRun of contract.dryRunEvidence) {
  assert.match(dryRun.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(dryRun.command.length > 10);
  assert.match(dryRun.result, /^(pass|fail|mixed)$/);
  assert.ok(Array.isArray(dryRun.observations));
  assert.ok(dryRun.observations.length > 0);
  if (dryRun.level === "public-http-readback") {
    assert.ok(Array.isArray(dryRun.fixtureResults));
    assert.ok(dryRun.fixtureResults.length > 0);
    assert.ok(
      dryRun.fixtureResults.some(
        (fixture) =>
          fixture.url === "https://demo.degov.ai/sitemap.xml" &&
          fixture.observedContentType.includes("text/html") &&
          fixture.assertionResult === "fail"
      ),
      "missing public sitemap fake-200 failure evidence"
    );
  } else {
    assert.ok(Array.isArray(dryRun.fixturesCovered));
    assert.ok(dryRun.fixturesCovered.length > 0);
  }
}

console.log(
  `SEO/GEO route contract ok: ${contract.products.length} products, ${contract.routeClasses.length} route classes`
);
