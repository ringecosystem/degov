#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildMarkdownReport,
  compareTableSnapshots,
  createParityReport,
  loadJson,
  parseArgs,
  tableSnapshotsFromProjectedOutputs,
} from "./v4-parity-audit.mjs";

const indexerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = (...segments) =>
  path.join(indexerRoot, "tests/support/fixtures", ...segments);

const projectedOutputs = await loadJson(
  fixturePath("known-dao-ranges/expected/projected-outputs.json"),
);
const expectedReport = await loadJson(
  fixturePath("known-dao-ranges/expected/v4-parity-audit.json"),
);

assert.throws(() => parseArgs(["--projected-outputs"]), /requires a value/);
assert.equal(parseArgs(["--fail-on-mismatch"]).failOnMismatch, true);
assert.equal(
  parseArgs(["--json-file=report.json"]).jsonFile.endsWith("report.json"),
  true,
);

const snapshots = tableSnapshotsFromProjectedOutputs(projectedOutputs);
assert.equal(snapshots.length, expectedReport.summary.matched_tables);
assert.deepEqual(
  snapshots.map((snapshot) => snapshot.table),
  expectedReport.matched_tables.map((table) => table.table),
);

const comparison = compareTableSnapshots(snapshots, expectedReport.v4_snapshot.tables);
assert.equal(comparison.matched.length, expectedReport.summary.matched_tables);
assert.deepEqual(comparison.mismatches, []);
assert.deepEqual(comparison.missing_v4_tables, []);
assert.deepEqual(comparison.unexpected_datalens_tables, []);

const mutated = structuredClone(snapshots);
mutated[0].row_count += 1;
const mismatch = compareTableSnapshots(mutated, expectedReport.v4_snapshot.tables);
assert.equal(mismatch.mismatches.length, 1);
assert.equal(mismatch.mismatches[0].table, snapshots[0].table);

const report = createParityReport(projectedOutputs, expectedReport.v4_snapshot);
assert.equal(report.summary.real_mismatches, 0);
assert.equal(report.summary.expected_differences, 7);
assert.deepEqual(report, expectedReport);
assert.match(buildMarkdownReport(report), /V4 Parity Audit/);
assert.match(buildMarkdownReport(report), /Real mismatches: 0/);

console.log("V4 parity audit tests passed");
