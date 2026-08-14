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
  assert.match(hookSource, /useEffect\(\(\) => {\s*setResult\(null\);/);
  assert.match(hookSource, /reset\(\);/);
  assert.match(hookSource, /canExecute,\s*caller,\s*proposalId/s);
  assert.match(hookSource, /canExecute && Boolean\(caller\) && capability\.data\?\.enabled === true/);
  assert.match(displaySource, /canSimulate &&/);
  assert.match(displaySource, /onClick\("simulate"\)/);
});
