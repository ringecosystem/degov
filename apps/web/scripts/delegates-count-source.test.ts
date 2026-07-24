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

test("delegates page title uses delegate profile count", () => {
  assert.match(
    localeDelegatesPageSource,
    /export\s+\{\s*default\s*\}\s+from\s+"..\/..\/delegates\/page"/
  );
  assert.match(contributorQueriesSource, /delegateProfilesCount\s*\(/);
  assert.match(graphqlServiceSource, /getDelegateProfilesCount/);
  assert.match(
    delegatesPageSource,
    /contributorService\.getDelegateProfilesCount/
  );
  assert.match(delegatesPageSource, /delegateProfilesCount/);
  assert.doesNotMatch(delegatesPageSource, /delegatesCountAll_gt:\s*0/);
  assert.doesNotMatch(
    delegatesPageSource,
    /dataMetrics\?\.holdersCount\s*\?\?\s*dataMetrics\?\.memberCount/
  );
});
