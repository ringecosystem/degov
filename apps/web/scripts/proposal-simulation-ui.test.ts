import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const readSource = (relativePath: string) =>
  readFileSync(path.join(import.meta.dirname, "..", relativePath), "utf8");

test("proposal simulation uses finalized Square endpoints and clears stale results", () => {
  const serviceSource = readSource("src/services/proposal-simulation.ts");
  const hookSource = readSource(
    "src/app/proposal/[id]/use-proposal-simulation.ts"
  );
  const displaySource = readSource(
    "src/app/proposal/[id]/action-group-display.tsx"
  );

  assert.match(
    serviceSource,
    /\/api\/v1\/daos\/\$[{]encodeURIComponent\(daoCode\)[}]\/proposal-simulation\/capability/
  );
  assert.match(serviceSource, /\/simulation`/);
  assert.match(serviceSource, /caller/);
  assert.match(serviceSource, /descriptionHash/);
  assert.match(hookSource, /calculateDescriptionHash\(proposal\.originalDescription\)/);
  assert.match(hookSource, /values: proposal\.values\.map\(\(value\) => String\(value\)\)/);
  assert.match(
    hookSource,
    /currentResultKey\.current = resultKey;\s*abortRef\.current\?\.abort\(\);\s*setResult\(null\);/
  );
  assert.match(hookSource, /abortRef\.current\?\.abort\(\);/);
  assert.match(hookSource, /requestKey === currentResultKey\.current/);
  assert.match(hookSource, /signal: controller\.signal/);
  assert.match(hookSource, /setTimeout\(\(\) => setResult\(null\), 15_000\)/);
  assert.match(hookSource, /canExecute,\s*caller,\s*proposalId/s);
  assert.match(hookSource, /canExecute && Boolean\(caller\) && capability\.data\?\.enabled === true/);
  assert.match(displaySource, /canSimulate &&/);
  assert.match(displaySource, /onClick\("simulate"\)/);
  const resultSource = readSource(
    "src/app/proposal/[id]/proposal-simulation-result.tsx"
  );
  assert.match(resultSource, /result\.provider/);
  assert.match(resultSource, /result\.blockNumber/);
  assert.match(resultSource, /result\.simulatedAt/);
  assert.match(resultSource, /result\.caller/);
});
