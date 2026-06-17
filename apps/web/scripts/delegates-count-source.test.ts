import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const delegatesPageSource = readFileSync(
  new URL("../src/app/delegates/page.tsx", import.meta.url),
  "utf8"
);
const localeDelegatesPageSource = readFileSync(
  new URL("../src/app/[locale]/delegates/page.tsx", import.meta.url),
  "utf8"
);
const contributorQueriesSource = readFileSync(
  new URL("../src/services/graphql/queries/contributors.ts", import.meta.url),
  "utf8"
);
const graphqlServiceSource = readFileSync(
  new URL("../src/services/graphql/index.ts", import.meta.url),
  "utf8"
);

test("delegates page title uses contributors with delegators count", () => {
  assert.match(
    localeDelegatesPageSource,
    /export\s+\{\s*default\s*\}\s+from\s+"..\/..\/delegates\/page"/
  );
  assert.match(contributorQueriesSource, /contributorsPage\s*\(/);
  assert.match(contributorQueriesSource, /totalCount/);
  assert.match(graphqlServiceSource, /getContributorsPage/);
  assert.match(delegatesPageSource, /contributorService\.getContributorsPage/);
  assert.match(delegatesPageSource, /delegatesCountAll_gt:\s*0/);
  assert.match(delegatesPageSource, /delegatesCountPage\?\.totalCount/);
  assert.doesNotMatch(
    delegatesPageSource,
    /dataMetrics\?\.holdersCount\s*\?\?\s*dataMetrics\?\.memberCount/
  );
});
