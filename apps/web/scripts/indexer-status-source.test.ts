import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const removedStatusField = "squid" + "Status";
const removedStatusService = removedStatusField + "Service";

const readSource = (relativePath: string) =>
  readFileSync(path.join(import.meta.dirname, "..", relativePath), "utf8");

test("block sync hook reads native indexer status", () => {
  const source = readSource("src/hooks/useBlockSync.ts");

  assert.match(source, /indexerStatusService\.getIndexerStatus/);
  assert.match(source, /durableProcessedBlock/);
  assert.match(source, /provisionalHeight/);
  assert.match(source, /indexedBlock/);
  assert.match(source, /hasProvisionalHeight/);
  assert.match(source, /syncedPercentage/);
  assert.match(source, /refetchInterval:\s*CACHE_TIMES\.TWO_SECONDS/);
  assert.doesNotMatch(source, /refetchInterval:\s*CACHE_TIMES\.THIRTY_SECONDS/);
  assert.doesNotMatch(source, new RegExp(removedStatusField));
  assert.doesNotMatch(source, new RegExp(removedStatusService));
});

test("indexer status query requests native status fields", () => {
  const source = readSource("src/services/graphql/queries/indexerStatus.ts");

  assert.match(source, /query indexerStatus/);
  assert.match(source, /indexerStatus/);
  assert.match(source, /daoCode/);
  assert.match(source, /processedHeight/);
  assert.match(source, /provisionalHeight/);
  assert.match(source, /targetHeight/);
  assert.match(source, /syncedPercentage/);
  assert.match(source, /isSynced/);
  assert.match(source, /GET_INDEXER_STATUS_WITH_PROVISIONAL_HEIGHT/);
  assert.match(source, /provisionalHeight/);
  assert.doesNotMatch(source, new RegExp(removedStatusField));
});

test("indexer status fallback caches base variant without blocking upgrades forever", () => {
  const source = readSource("src/services/graphql/index.ts");

  assert.match(source, /BASE_INDEXER_STATUS_VARIANT_RETRY_MS/);
  assert.match(source, /cachedAt/);
  assert.match(source, /variant\.key === "base"/);
  assert.match(source, /indexerStatusQueryVariantByEndpoint\.set/);
});

test("indexer status tooltip includes confirmed safe height", () => {
  const source = readSource("src/components/indexer-status.tsx");

  assert.match(source, /durableProcessedBlock/);
  assert.match(source, /confirmedSafeHeight/);
});
