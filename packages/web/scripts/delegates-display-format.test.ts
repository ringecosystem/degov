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

test("delegate display helper keeps one decimal of compact precision", () => {
  assert.match(
    numberUtilsSource,
    /export function formatDelegateCountForDisplay\(num: number\): string \{\s+return formatNumberForDisplay\(num, 1\)\[0\];\s+\}/
  );
});

test("overview and system info both use the delegate display helper", () => {
  assert.match(
    overviewSource,
    /formatDelegateCountForDisplay\(governanceCounts\?\.delegatesCount \?\? 0\)/
  );
  assert.match(
    systemInfoSource,
    /const totalDelegates = formatDelegateCountForDisplay\(\s*governanceCounts\?\.delegatesCount \?\? 0\s*\)/
  );
});
