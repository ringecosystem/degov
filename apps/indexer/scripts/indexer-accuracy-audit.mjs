#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  classifyDatalensQueryError,
  classifyProjectionMismatch,
  compactAmount,
  graphqlRequest,
  loadTargets,
  parsePositiveInt,
  readCurrentVotes,
  readDatalensStatus,
  readTokenBalance,
} from "./indexer-diagnostics.mjs";

const TOP_CONTRIBUTORS_QUERY = `
  query TopContributors($limit: Int!, $offset: Int!) {
    contributors(limit: $limit, offset: $offset, orderBy: [power_DESC]) {
      id
      power
      balance
      delegatesCountAll
      lastVoteTimestamp
    }
  }
`;

const NEGATIVE_ROWS_QUERY = `
  query NegativeRows($limit: Int!, $offset: Int!) {
    contributors(limit: $limit, offset: $offset, orderBy: [power_ASC], where: { power_lt: 0 }) {
      id
      power
    }
    delegates(limit: $limit, offset: $offset, orderBy: [power_ASC], where: { power_lt: 0 }) {
      id
      fromDelegate
      toDelegate
      power
    }
  }
`;

export function parseArgs(argv) {
  const options = {
    concurrency: 10,
    databaseUrl: process.env.DEGOV_INDEXER_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
    failOnAnomalies: false,
    jsonFile: "",
    limit: 100,
    markdownFile: "",
    negativeLimit: 100,
    targetsFile: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--fail-on-anomalies") {
      options.failOnAnomalies = true;
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
      case "--concurrency":
        options.concurrency = parsePositiveInt(value, "--concurrency");
        break;
      case "--database-url":
        options.databaseUrl = value;
        break;
      case "--json-file":
        options.jsonFile = value;
        break;
      case "--limit":
        options.limit = parsePositiveInt(value, "--limit");
        break;
      case "--markdown-file":
        options.markdownFile = value;
        break;
      case "--negative-limit":
        options.negativeLimit = parsePositiveInt(value, "--negative-limit");
        break;
      case "--targets-file":
        options.targetsFile = path.resolve(process.cwd(), value);
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

export async function fetchTopContributors(target, limit) {
  const data = await graphqlRequest(target.indexerEndpoint, TOP_CONTRIBUTORS_QUERY, {
    limit,
    offset: 0,
  });
  return data.contributors ?? [];
}

export async function fetchNegativeRows(target, limit) {
  const data = await graphqlRequest(target.indexerEndpoint, NEGATIVE_ROWS_QUERY, {
    limit,
    offset: 0,
  });
  return {
    contributors: data.contributors ?? [],
    delegates: data.delegates ?? [],
  };
}

async function runWithConcurrency(items, concurrency, worker) {
  const pending = new Set();
  const results = [];
  for (const item of items) {
    const task = Promise.resolve().then(() => worker(item));
    pending.add(task);
    results.push(task);
    task.finally(() => pending.delete(task));
    if (pending.size >= concurrency) {
      await Promise.race(pending);
    }
  }
  return Promise.allSettled(results);
}

export async function auditTarget(target, options, services = {}) {
  const result = {
    code: target.code,
    name: target.name ?? target.code,
    checkedAccounts: 0,
    matches: 0,
    mismatches: [],
    negativeContributors: [],
    negativeDelegates: [],
    queryErrors: [],
    voteReadErrors: [],
  };
  const fetchContributors = services.fetchTopContributors ?? fetchTopContributors;
  const fetchNegatives = services.fetchNegativeRows ?? fetchNegativeRows;
  const readVotes = services.readCurrentVotes ?? readCurrentVotes;
  const readBalance = services.readTokenBalance ?? readTokenBalance;

  const [contributorsResult, negativesResult] = await Promise.allSettled([
    fetchContributors(target, target.limit ?? options.limit),
    fetchNegatives(target, target.negativeLimit ?? options.negativeLimit),
  ]);

  if (contributorsResult.status === "rejected") {
    result.queryErrors.push({
      scope: "contributors",
      classification: classifyDatalensQueryError(contributorsResult.reason),
      message: contributorsResult.reason?.message ?? String(contributorsResult.reason),
    });
    return finalizeTargetResult(result);
  }

  if (negativesResult.status === "fulfilled") {
    result.negativeContributors = negativesResult.value.contributors.map((entry) => ({
      address: entry.id,
      power: entry.power,
      hint: "negative-contributor-power",
    }));
    result.negativeDelegates = negativesResult.value.delegates.map((entry) => ({
      id: entry.id,
      fromDelegate: entry.fromDelegate,
      toDelegate: entry.toDelegate,
      power: entry.power,
      hint: "negative-delegate-power",
    }));
  } else {
    result.queryErrors.push({
      scope: "negative-rows",
      classification: classifyDatalensQueryError(negativesResult.reason),
      message: negativesResult.reason?.message ?? String(negativesResult.reason),
    });
  }

  const contributors = contributorsResult.value;
  result.checkedAccounts = contributors.length;
  await runWithConcurrency(
    contributors,
    options.concurrency,
    async (entry) => {
      try {
        const [chainVotes, tokenBalance] = await Promise.all([
          readVotes(target, entry.id),
          readBalance(target, entry.id).catch(() => null),
        ]);
        const mismatch = classifyProjectionMismatch({
          indexed: entry.power,
          chain: chainVotes.value,
          source: "onchain-power",
        });
        if (!mismatch) {
          result.matches += 1;
          return;
        }
        result.mismatches.push({
          address: entry.id,
          contributorPower: entry.power,
          contributorBalance: entry.balance,
          chainPower: chainVotes.value,
          chainBalance: tokenBalance,
          detailSource: chainVotes.source,
          delta: (BigInt(entry.power) - BigInt(chainVotes.value)).toString(),
          hint: mismatch,
        });
      } catch (error) {
        result.voteReadErrors.push({
          address: entry.id,
          classification: classifyDatalensQueryError(error),
          message: error?.message ?? String(error),
        });
      }
    },
  );

  return finalizeTargetResult(result);
}

export function finalizeTargetResult(result) {
  return {
    ...result,
    anomalyCount:
      result.mismatches.length +
      result.negativeContributors.length +
      result.negativeDelegates.length +
      result.queryErrors.length +
      result.voteReadErrors.length,
  };
}

export function summarizeAudit(targets, status) {
  const targetSummary = targets.reduce(
    (summary, target) => ({
      checkedAccounts: summary.checkedAccounts + target.checkedAccounts,
      matches: summary.matches + target.matches,
      mismatches: summary.mismatches + target.mismatches.length,
      negativeContributors:
        summary.negativeContributors + target.negativeContributors.length,
      negativeDelegates: summary.negativeDelegates + target.negativeDelegates.length,
      queryErrors: summary.queryErrors + target.queryErrors.length,
      voteReadErrors: summary.voteReadErrors + target.voteReadErrors.length,
      totalAnomalies: summary.totalAnomalies + target.anomalyCount,
    }),
    {
      checkedAccounts: 0,
      matches: 0,
      mismatches: 0,
      negativeContributors: 0,
      negativeDelegates: 0,
      queryErrors: 0,
      voteReadErrors: 0,
      totalAnomalies: 0,
    },
  );
  return {
    ...targetSummary,
    checkpointStalls: status?.checkpointStalls?.length ?? 0,
    onchainRefreshBacklog: Object.values(
      status?.onchainRefreshBacklog ?? {},
    ).reduce((sum, count) => sum + count, 0),
  };
}

export function buildMarkdownReport(report, targets) {
  const lines = [
    "## Datalens Indexer Accuracy Audit",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "### Summary",
    "",
    `- Checked accounts: ${report.summary.checkedAccounts}`,
    `- Matches: ${report.summary.matches}`,
    `- Vote mismatches: ${report.summary.mismatches}`,
    `- Vote read errors: ${report.summary.voteReadErrors}`,
    `- Negative contributor rows: ${report.summary.negativeContributors}`,
    `- Negative delegate rows: ${report.summary.negativeDelegates}`,
    `- Query errors: ${report.summary.queryErrors}`,
    `- Checkpoint stalls: ${report.status.checkpointStalls.length}`,
    `- Onchain refresh backlog: ${report.summary.onchainRefreshBacklog}`,
    `- Total anomalies: ${report.summary.totalAnomalies}`,
    "",
  ];
  for (const target of report.targets) {
    const config = targets.find((entry) => entry.code === target.code) ?? {};
    const decimals = config.tokenDecimals ?? 18;
    lines.push(`### ${target.name} (\`${target.code}\`)`, "");
    lines.push(`- Endpoint: ${config.indexerEndpoint ?? "unknown"}`);
    lines.push(`- Checked: ${target.checkedAccounts}`);
    lines.push(`- Matches: ${target.matches}`);
    lines.push(`- Anomalies: ${target.anomalyCount}`);
    for (const mismatch of target.mismatches) {
      lines.push(
        `- ${mismatch.address}: DeGov ${compactAmount(
          mismatch.contributorPower,
          decimals,
        )}, chain ${compactAmount(mismatch.chainPower, decimals)}, source ${mismatch.detailSource}, hint \`${mismatch.hint}\``,
      );
    }
    for (const error of [...target.queryErrors, ...target.voteReadErrors]) {
      lines.push(`- ${error.classification}: ${error.message}`);
    }
    lines.push("");
  }
  if (report.status.checkpointStalls.length > 0) {
    lines.push("### Checkpoint Stalls", "");
    for (const checkpoint of report.status.checkpointStalls) {
      lines.push(
        `- ${checkpoint.daoCode}/${checkpoint.streamId}: processed=${checkpoint.processedHeight}, target=${checkpoint.targetHeight}, lag=${checkpoint.lagBlocks}, updated=${checkpoint.updatedAt}`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

export async function runAudit(targets, options, services = {}) {
  const targetResults = [];
  for (const target of targets) {
    targetResults.push(await auditTarget(target, options, services));
  }
  const status = services.status ?? (await readDatalensStatus(options.databaseUrl));
  return {
    generatedAt: new Date().toISOString(),
    targets: targetResults,
    status,
    summary: summarizeAudit(targetResults, status),
  };
}

async function writeFileIfNeeded(filePath, content) {
  if (!filePath) {
    return;
  }
  const absolutePath = path.resolve(process.cwd(), filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

export function usage() {
  return [
    "Usage: node apps/indexer/scripts/indexer-accuracy-audit.mjs [options]",
    "",
    "Options:",
    "  --targets-file <path>      JSON target list for ENS, Lisk, or migrated DAOs",
    "  --database-url <url>       Optional read-only Postgres URL for Datalens status tables",
    "  --limit <n>                Contributors per DAO to compare",
    "  --negative-limit <n>       Negative projection rows to inspect",
    "  --concurrency <n>          Concurrent RPC reads",
    "  --json-file <path>         Write JSON report",
    "  --markdown-file <path>     Write markdown report",
    "  --fail-on-anomalies        Exit non-zero when anomalies are found",
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const targets = await loadTargets(options.targetsFile || undefined);
  const report = await runAudit(targets, options);
  const markdown = buildMarkdownReport(report, targets);
  await writeFileIfNeeded(options.jsonFile, JSON.stringify(report, null, 2));
  await writeFileIfNeeded(options.markdownFile, markdown);
  console.log(
    `Datalens accuracy audit checked ${report.summary.checkedAccounts} accounts across ${report.targets.length} DAOs; anomalies=${report.summary.totalAnomalies}; checkpointStalls=${report.status.checkpointStalls.length}; onchainRefreshBacklog=${report.summary.onchainRefreshBacklog}`,
  );
  if (options.failOnAnomalies && report.summary.totalAnomalies > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
