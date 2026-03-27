import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const numberUtilsSource = readFileSync(
  new URL("../src/utils/number.ts", import.meta.url),
  "utf8"
);
const overviewSource = readFileSync(
  new URL("../src/app/_components/overview.tsx", import.meta.url),
  "utf8"
);
const systemInfoSource = readFileSync(
  new URL("../src/components/system-info.tsx", import.meta.url),
  "utf8"
);

test("delegate display uses shared number formatting without a delegate-specific helper", () => {
  assert.doesNotMatch(numberUtilsSource, /formatDelegateCountForDisplay/);
});

test("overview and system info both use compact number formatting with one decimal for delegates", () => {
  assert.match(
    overviewSource,
    /formatNumberForDisplay\(governanceCounts\?\.delegatesCount \?\? 0, 1\)\[0\]/
  );
  assert.match(
    systemInfoSource,
    /const totalDelegates = formatNumberForDisplay\(\s*governanceCounts\?\.delegatesCount \?\? 0,\s*1\s*\)\[0\]/
  );
});
