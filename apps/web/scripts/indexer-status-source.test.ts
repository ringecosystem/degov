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
  assert.match(source, /targetHeight/);
  assert.match(source, /syncedPercentage/);
  assert.match(source, /isSynced/);
  assert.doesNotMatch(source, new RegExp(removedStatusField));
});
