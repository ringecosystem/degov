import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const workspaceRoot = path.resolve(import.meta.dirname, "..");

test("delegates summary surfaces use full integer formatting", async () => {
  const overviewSource = await readFile(
    path.join(workspaceRoot, "src/app/_components/overview.tsx"),
    "utf8"
  );
  const systemInfoSource = await readFile(
    path.join(workspaceRoot, "src/components/system-info.tsx"),
    "utf8"
  );

  assert.match(
    overviewSource,
    /formatInteger\(governanceCounts\?\.delegatesCount \?\? 0, "0"\)/
  );
  assert.match(
    systemInfoSource,
    /value=\{formatInteger\(systemData\.totalDelegates \?\? 0, "0"\)\}/
  );
});

test("delegate formatting regression documents the intended 2700 display", () => {
  assert.equal(new Intl.NumberFormat().format(2700), "2,700");
});
