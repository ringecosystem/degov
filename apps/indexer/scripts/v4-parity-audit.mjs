#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const INDEXER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_PROJECTED_OUTPUTS =
  path.join(
    INDEXER_ROOT,
    "tests/support/fixtures/known-dao-ranges/expected/projected-outputs.json",
  );
const DEFAULT_V4_PARITY_REPORT =
  path.join(
    INDEXER_ROOT,
    "tests/support/fixtures/known-dao-ranges/expected/v4-parity-audit.json",
  );

const TABLE_SPECS = [
  { table: "Proposal", scope: "proposal rows", path: ["proposal", "proposals"] },
  {
    table: "ProposalCreated",
    scope: "proposal rows",
    path: ["proposal", "proposal_created"],
  },
  {
    table: "ProposalAction",
    scope: "proposal actions",
    path: ["proposal", "proposal_actions"],
  },
  {
    table: "ProposalQueued",
    scope: "proposal state epochs",
    path: ["proposal", "proposal_queued"],
  },
  {
    table: "ProposalDeadlineExtension",
    scope: "deadline extensions",
    path: ["proposal", "proposal_deadline_extensions"],
  },
  {
    table: "ProposalExecuted",
    scope: "proposal state epochs",
    path: ["proposal", "proposal_executed"],
  },
  {
    table: "ProposalStateEpoch",
    scope: "proposal state epochs",
    path: ["proposal", "state_epochs"],
  },
  { table: "VoteCast", scope: "votes", path: ["vote", "vote_cast"] },
  {
    table: "VoteCastWithParams",
    scope: "votes",
    path: ["vote", "vote_cast_with_params"],
  },
  {
    table: "VoteCastGroup",
    scope: "proposal/global vote metrics",
    path: ["vote", "vote_cast_groups"],
  },
  {
    table: "ProposalVoteMetric",
    scope: "proposal/global vote metrics",
    path: ["vote", "proposal_vote_totals"],
  },
  {
    table: "DataMetricVoteDelta",
    scope: "DataMetric proposal/vote/power/member counts",
    path: ["vote", "data_metric_delta"],
  },
  {
    table: "DelegateChanged",
    scope: "delegation/token rows",
    path: ["token_erc20", "delegate_changed"],
  },
  {
    table: "DelegateVotesChanged",
    scope: "delegation/token rows",
    path: ["token_erc20", "delegate_votes_changed"],
  },
  {
    table: "TokenTransfer",
    scope: "delegation/token rows",
    path: ["token_erc20", "token_transfers"],
  },
  {
    table: "DelegateRolling",
    scope: "delegation/token rows",
    path: ["token_erc20", "delegate_rollings"],
  },
  {
    table: "DelegateMapping",
    scope: "delegation/token rows",
    path: ["token_erc20", "delegate_mappings"],
  },
  {
    table: "Delegate",
    scope: "delegation/token rows",
    path: ["token_erc20", "delegates"],
  },
  {
    table: "Contributor",
    scope: "delegation/token rows",
    path: ["token_erc20", "contributors"],
  },
  {
    table: "DataMetricTokenDelta",
    scope: "DataMetric proposal/vote/power/member counts",
    path: ["token_erc20", "data_metric_delta"],
  },
  {
    table: "TokenTransferErc721",
    scope: "delegation/token rows",
    path: ["token_erc721", "token_transfers"],
  },
  {
    table: "TimelockOperation",
    scope: "timelock rows and proposal bindings",
    path: ["timelock", "operations"],
  },
  {
    table: "TimelockCall",
    scope: "timelock rows and proposal bindings",
    path: ["timelock", "calls"],
  },
  {
    table: "TimelockRoleEvent",
    scope: "timelock role rows",
    path: ["timelock", "role_events"],
  },
  {
    table: "TimelockMinDelayChange",
    scope: "timelock min-delay rows",
    path: ["timelock", "min_delay_changes"],
  },
  {
    table: "TimelockOperationHint",
    scope: "timelock rows and proposal bindings",
    path: ["timelock", "operation_hints"],
  },
  {
    table: "ProposalGovernanceReadPlan",
    scope: "governance parameter checkpoints",
    path: ["proposal", "chain_read_metrics"],
  },
  {
    table: "TimelockRefreshReadPlan",
    scope: "OnchainRefreshTask creation",
    path: ["timelock", "chain_read_metrics"],
  },
  {
    table: "TokenPowerRefreshReadPlan",
    scope: "OnchainRefreshTask creation and known-account discovery",
    path: ["token_erc20", "reconcile_metrics"],
  },
];

const EXPECTED_DIFFERENCES = [
  {
    table: "degov_indexer_checkpoint",
    reason:
      "Datalens-native checkpoint rows replace SQD processor metadata tables for deterministic range progress.",
  },
  {
    table: "vote_power_checkpoint",
    reason:
      "Datalens stores reusable vote-power checkpoint rows; v4 resolved these through processor-local reads.",
  },
  {
    table: "token_balance_checkpoint",
    reason:
      "Datalens stores reusable token-balance checkpoint rows; v4 did not persist this checkpoint table.",
  },
  {
    table: "governance_parameter_checkpoint",
    reason:
      "Datalens checkpoint tables normalize governance parameter reads instead of SQD processor metadata.",
  },
  {
    table: "sqd_processor_status",
    reason:
      "Removed SQD processor metadata is intentionally absent from the Datalens-native indexer.",
  },
  {
    table: "sqd_processor_state",
    reason:
      "Removed SQD processor metadata is intentionally absent from the Datalens-native indexer.",
  },
  {
    table: "sqd_processor_hot_blocks",
    reason:
      "Removed SQD processor metadata is intentionally absent from the Datalens-native indexer.",
  },
];

export function parseArgs(argv) {
  const options = {
    failOnMismatch: false,
    jsonFile: "",
    markdownFile: "",
    projectedOutputs: DEFAULT_PROJECTED_OUTPUTS,
    v4SnapshotFile: DEFAULT_V4_PARITY_REPORT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--fail-on-mismatch") {
      options.failOnMismatch = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    const [flag, inlineValue] = token.split("=", 2);
    const value = inlineValue ?? argv[index + 1];
    const expectsValue = inlineValue === undefined;

    switch (flag) {
      case "--json-file":
        options.jsonFile = requireOptionValue(flag, value);
        break;
      case "--markdown-file":
        options.markdownFile = requireOptionValue(flag, value);
        break;
      case "--projected-outputs":
        options.projectedOutputs = requireOptionValue(flag, value);
        break;
      case "--v4-snapshot-file":
        options.v4SnapshotFile = requireOptionValue(flag, value);
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }

    if (expectsValue) {
      index += 1;
    }
  }

  return options;
}

export async function loadJson(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

export function tableSnapshotsFromProjectedOutputs(projectedOutputs) {
  return TABLE_SPECS.map((spec) => {
    const value = valueAtPath(projectedOutputs, spec.path);
    return {
      table: spec.table,
      scope: spec.scope,
      row_count: rowCount(value),
      sha256: sha256(canonicalJson(value)),
    };
  });
}

export function compareTableSnapshots(datalensTables, v4Tables) {
  const datalensByTable = new Map(datalensTables.map((table) => [table.table, table]));
  const v4ByTable = new Map(v4Tables.map((table) => [table.table, table]));
  const matched = [];
  const mismatches = [];
  const missing_v4_tables = [];

  for (const datalens of datalensTables) {
    const expected = v4ByTable.get(datalens.table);
    if (!expected) {
      missing_v4_tables.push(datalens.table);
      continue;
    }
    if (datalens.row_count === expected.row_count && datalens.sha256 === expected.sha256) {
      matched.push(datalens);
      continue;
    }
    mismatches.push({
      table: datalens.table,
      datalens: {
        row_count: datalens.row_count,
        sha256: datalens.sha256,
      },
      expected_v4: {
        row_count: expected.row_count,
        sha256: expected.sha256,
      },
    });
  }

  return {
    matched,
    mismatches,
    missing_v4_tables,
    unexpected_datalens_tables: v4Tables
      .filter((table) => !datalensByTable.has(table.table))
      .map((table) => table.table),
  };
}

export function createParityReport(projectedOutputs, v4Snapshot) {
  const datalensTables = tableSnapshotsFromProjectedOutputs(projectedOutputs);
  const comparison = compareTableSnapshots(datalensTables, v4Snapshot.tables);
  const realMismatchCount =
    comparison.mismatches.length +
    comparison.missing_v4_tables.length +
    comparison.unexpected_datalens_tables.length;

  return {
    report: "v4-parity-audit",
    fixture: "known-dao-ranges",
    limitation:
      "Live v4 comparison is not required locally; this audit compares deterministic Datalens fixture outputs against fixture-backed v4 business-result snapshots for selected demo, ENS/Lisk, and timelock ranges.",
    scopes: [
      "Proposal rows/actions/state epochs/deadline extensions/governance parameter checkpoints",
      "VoteCast/VoteCastWithParams/VoteCastGroup and proposal/global vote metrics",
      "DelegateChanged, DelegateVotesChanged, TokenTransfer, DelegateRolling, DelegateMapping, Delegate, Contributor rows",
      "TimelockOperation, TimelockCall, role/min-delay rows and proposal bindings",
      "OnchainRefreshTask creation and known-account discovery",
      "DataMetric proposal/vote/power/member counts",
    ],
    v4_snapshot: {
      source: v4Snapshot.source,
      tables: v4Snapshot.tables,
    },
    matched_tables: comparison.matched,
    expected_differences: EXPECTED_DIFFERENCES,
    real_mismatches: comparison.mismatches,
    missing_v4_tables: comparison.missing_v4_tables,
    unexpected_datalens_tables: comparison.unexpected_datalens_tables,
    summary: {
      matched_tables: comparison.matched.length,
      expected_differences: EXPECTED_DIFFERENCES.length,
      real_mismatches: realMismatchCount,
    },
  };
}

export function buildMarkdownReport(report) {
  const lines = [
    "## V4 Parity Audit",
    "",
    `Fixture: \`${report.fixture}\``,
    "",
    "### Summary",
    "",
    `- Matched tables: ${report.summary.matched_tables}`,
    `- Expected differences: ${report.summary.expected_differences}`,
    `- Real mismatches: ${report.summary.real_mismatches}`,
    "",
    "### Matched Tables",
    "",
  ];

  for (const table of report.matched_tables) {
    lines.push(
      `- ${table.table}: rows=${table.row_count}, scope=${table.scope}, sha256=${table.sha256}`,
    );
  }

  lines.push("", "### Expected Differences", "");
  for (const difference of report.expected_differences) {
    lines.push(`- ${difference.table}: ${difference.reason}`);
  }

  if (report.real_mismatches.length > 0) {
    lines.push("", "### Real Mismatches", "");
    for (const mismatch of report.real_mismatches) {
      lines.push(
        `- ${mismatch.table}: Datalens rows=${mismatch.datalens.row_count} sha256=${mismatch.datalens.sha256}; v4 rows=${mismatch.expected_v4.row_count} sha256=${mismatch.expected_v4.sha256}`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

export function usage() {
  return [
    "Usage: node apps/indexer/scripts/v4-parity-audit.mjs [options]",
    "",
    "Options:",
    "  --projected-outputs <path>  Datalens fixture projected output JSON",
    "  --v4-snapshot-file <path>   Report JSON containing fixture-backed v4 snapshot hashes",
    "  --json-file <path>          Write JSON report",
    "  --markdown-file <path>      Write markdown report",
    "  --fail-on-mismatch          Exit non-zero when real mismatches remain",
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const projectedOutputs = await loadJson(options.projectedOutputs);
  const v4SnapshotReport = await loadJson(options.v4SnapshotFile);
  const report = createParityReport(projectedOutputs, v4SnapshotReport.v4_snapshot);
  await writeFileIfNeeded(options.jsonFile, JSON.stringify(report, null, 2));
  await writeFileIfNeeded(options.markdownFile, buildMarkdownReport(report));
  console.log(
    `V4 parity audit matched ${report.summary.matched_tables} tables; expectedDifferences=${report.summary.expected_differences}; realMismatches=${report.summary.real_mismatches}`,
  );
  if (options.failOnMismatch && report.summary.real_mismatches > 0) {
    process.exitCode = 1;
  }
}

function valueAtPath(value, parts) {
  return parts.reduce((current, part) => current?.[part], value) ?? [];
}

function rowCount(value) {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length;
  }
  return value === undefined || value === null ? 0 : 1;
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requireOptionValue(flag, value) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

async function writeFileIfNeeded(filePath, content) {
  if (!filePath) {
    return;
  }
  const absolutePath = path.resolve(process.cwd(), filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
