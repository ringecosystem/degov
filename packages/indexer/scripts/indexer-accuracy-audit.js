const fs = require("node:fs/promises");
const path = require("node:path");
const YAML = require("yaml");
const {
  createPublicClient,
  formatUnits,
  http,
  parseAbi,
} = require("viem");

const TOP_CONTRIBUTORS_QUERY = `
  query TopContributors($limit: Int!, $offset: Int!) {
    contributors(limit: $limit, offset: $offset, orderBy: [power_DESC]) {
      id
      power
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

const ERC20_VOTES_ABI = parseAbi([
  "function getVotes(address) view returns (uint256)",
]);
const GOVERNOR_ABI = parseAbi([
  "function CLOCK_MODE() view returns (string)",
  "function clock() view returns (uint48)",
  "function getVotes(address, uint256) view returns (uint256)",
]);

const DEFAULT_OPTIONS = {
  auditConfigFile: "",
  concurrency: 10,
  failOnAnomalies: false,
  jsonFile: "",
  limit: 200,
  markdownFile: "",
  negativeLimit: 200,
  targetsFile: path.resolve(__dirname, "indexer-accuracy-targets.json"),
};

function parseArgs(argv) {
  const options = { ...DEFAULT_OPTIONS };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--fail-on-anomalies") {
      options.failOnAnomalies = true;
      continue;
    }

    if (!token.startsWith("--")) {
      continue;
    }

    const [flag, inlineValue] = token.split("=", 2);
    const value = inlineValue ?? argv[index + 1];
    const expectsValue = inlineValue === undefined;

    switch (flag) {
      case "--audit-config-file":
        options.auditConfigFile = path.resolve(process.cwd(), value);
        break;
      case "--limit":
        options.limit = Number.parseInt(value, 10);
        break;
      case "--negative-limit":
        options.negativeLimit = Number.parseInt(value, 10);
        break;
      case "--concurrency":
        options.concurrency = Number.parseInt(value, 10);
        break;
      case "--json-file":
        options.jsonFile = value;
        break;
      case "--markdown-file":
        options.markdownFile = value;
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

  if (!Number.isInteger(options.limit) || options.limit <= 0) {
    throw new Error("--limit must be a positive integer");
  }
  if (
    !Number.isInteger(options.negativeLimit) ||
    options.negativeLimit <= 0
  ) {
    throw new Error("--negative-limit must be a positive integer");
  }
  if (
    !Number.isInteger(options.concurrency) ||
    options.concurrency <= 0
  ) {
    throw new Error("--concurrency must be a positive integer");
  }

  return options;
}

function parseStructuredFile(raw, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".yaml" || extension === ".yml") {
    return YAML.parse(raw);
  }

  return JSON.parse(raw);
}

function parseOptionalPositiveInt(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return parsed;
}

function normalizeTarget(target) {
  return {
    tokenDecimals: 18,
    ...target,
  };
}

function resolveConfiguredTarget(baseTargets, configuredTarget) {
  const targetCode = configuredTarget.code ?? configuredTarget.name;
  const configuredIndexer =
    configuredTarget.indexerEndpoint ?? configuredTarget.indexer;
  const baseTarget = baseTargets.find((target) => {
    if (targetCode && target.code === targetCode) {
      return true;
    }

    if (!targetCode && configuredIndexer) {
      return target.indexerEndpoint === configuredIndexer;
    }

    return false;
  });

  if (!baseTarget) {
    throw new Error(
      `Unknown audit target: ${targetCode ?? configuredIndexer ?? "unknown"}`
    );
  }

  const limit = parseOptionalPositiveInt(configuredTarget.limit, "limit");
  const negativeLimit = parseOptionalPositiveInt(
    configuredTarget.negativeLimit,
    "negativeLimit"
  );

  return {
    ...baseTarget,
    ...(configuredIndexer
      ? {
          indexerEndpoint: configuredIndexer,
        }
      : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(negativeLimit !== undefined
      ? { negativeLimit }
      : limit !== undefined
        ? { negativeLimit: limit }
        : {}),
  };
}

async function loadTargets(targetsFile, auditConfigFile = "") {
  const raw = await fs.readFile(targetsFile, "utf8");
  const targets = parseStructuredFile(raw, targetsFile);

  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error("Targets file must contain a non-empty array");
  }

  const baseTargets = targets.map(normalizeTarget);

  if (!auditConfigFile) {
    return baseTargets;
  }

  const auditConfigRaw = await fs.readFile(auditConfigFile, "utf8");
  const auditConfig = parseStructuredFile(auditConfigRaw, auditConfigFile);

  if (!Array.isArray(auditConfig) || auditConfig.length === 0) {
    throw new Error("Audit config file must contain a non-empty array");
  }

  return auditConfig.map((configuredTarget) =>
    resolveConfiguredTarget(baseTargets, configuredTarget)
  );
}

async function graphqlRequest(endpoint, query, variables = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `GraphQL request failed with HTTP ${response.status} ${response.statusText}`
    );
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(
      payload.errors
        .map((error) => error.message || JSON.stringify(error))
        .join("; ")
    );
  }

  return payload.data;
}

async function fetchTopContributors(target, limit) {
  const data = await graphqlRequest(
    target.indexerEndpoint,
    TOP_CONTRIBUTORS_QUERY,
    { limit, offset: 0 }
  );

  return data.contributors ?? [];
}

async function fetchNegativeRows(target, limit) {
  const data = await graphqlRequest(
    target.indexerEndpoint,
    NEGATIVE_ROWS_QUERY,
    { limit, offset: 0 }
  );

  return {
    contributors: data.contributors ?? [],
    delegates: data.delegates ?? [],
  };
}

function createClient(target) {
  return createPublicClient({
    transport: http(target.rpcUrl),
  });
}

async function readClockMode(client, target) {
  if (!target.governor) {
    return "blocknumber";
  }

  try {
    const rawClockMode = await client.readContract({
      address: target.governor,
      abi: GOVERNOR_ABI,
      functionName: "CLOCK_MODE",
    });

    const normalized =
      typeof rawClockMode === "string" ? rawClockMode.toLowerCase() : "";

    if (normalized.includes("mode=timestamp")) {
      return "timestamp";
    }
  } catch (_error) {
    return "blocknumber";
  }

  return "blocknumber";
}

async function readCurrentVotes(target, address, client = createClient(target)) {
  try {
    const votes = await client.readContract({
      address: target.governorToken,
      abi: ERC20_VOTES_ABI,
      functionName: "getVotes",
      args: [address],
    });

    return {
      source: "token.getVotes",
      value: votes.toString(),
    };
  } catch (tokenError) {
    if (!target.governor) {
      throw tokenError;
    }

    const clockMode = await readClockMode(client, target);
    let timepoint;

    if (clockMode === "timestamp") {
      timepoint = await client.readContract({
        address: target.governor,
        abi: GOVERNOR_ABI,
        functionName: "clock",
      });
    } else {
      const blockNumber = await client.getBlockNumber();
      timepoint = blockNumber > 1n ? blockNumber - 1n : blockNumber;
    }

    const votes = await client.readContract({
      address: target.governor,
      abi: GOVERNOR_ABI,
      functionName: "getVotes",
      args: [address, timepoint],
    });

    return {
      source: "governor.getVotes",
      value: votes.toString(),
    };
  }
}

function compactAmount(rawValue, decimals = 18) {
  const value = Number(formatUnits(BigInt(rawValue), decimals));
  if (!Number.isFinite(value)) {
    return rawValue;
  }

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function compactDelta(left, right, decimals = 18) {
  const delta = BigInt(left) - BigInt(right);
  const prefix = delta >= 0n ? "+" : "-";
  const absolute = delta >= 0n ? delta : -delta;
  return `${prefix}${compactAmount(absolute.toString(), decimals)}`;
}

function reasonHintForMismatch(target, contributorPower, detailPower) {
  const contributorValue = BigInt(contributorPower);
  const detailValue = BigInt(detailPower);

  if (contributorValue > detailValue) {
    return target.negativeDelegates.length > 0
      ? "index-higher-with-negative-delegates"
      : "index-higher-than-chain";
  }

  if (contributorValue < detailValue) {
    return "index-lower-than-chain";
  }

  return "unknown";
}

async function runWithConcurrency(items, concurrency, worker) {
  const pending = new Set();

  for (const item of items) {
    const task = Promise.resolve().then(() => worker(item));
    pending.add(task);

    const cleanup = () => pending.delete(task);
    task.then(cleanup, cleanup);

    if (pending.size >= concurrency) {
      await Promise.race(pending);
    }
  }

  await Promise.allSettled(pending);
}

function createTargetSkeleton(target, limit) {
  return {
    code: target.code,
    name: target.name,
    checkedAccounts: 0,
    limit,
    matches: 0,
    mismatches: [],
    negativeContributors: [],
    negativeDelegates: [],
    queryErrors: [],
    voteReadErrors: [],
  };
}

async function auditTarget(target, options, services = {}) {
  const fetchContributors =
    services.fetchTopContributors ?? fetchTopContributors;
  const fetchNegatives = services.fetchNegativeRows ?? fetchNegativeRows;
  const readVotes = services.readCurrentVotes ?? readCurrentVotes;
  const contributorLimit = target.limit ?? options.limit;
  const negativeLimit =
    target.negativeLimit ?? target.limit ?? options.negativeLimit;

  const result = createTargetSkeleton(target, contributorLimit);

  const [contributorsResult, negativesResult] = await Promise.allSettled([
    fetchContributors(target, contributorLimit),
    fetchNegatives(target, negativeLimit),
  ]);

  if (contributorsResult.status === "rejected") {
    result.queryErrors.push({
      scope: "contributors",
      message: contributorsResult.reason?.message ?? String(contributorsResult.reason),
    });
    return finalizeTargetResult(result);
  }

  const contributors = contributorsResult.value;
  result.checkedAccounts = contributors.length;

  if (negativesResult.status === "fulfilled") {
    result.negativeContributors = negativesResult.value.contributors.map(
      (entry) => ({
        address: entry.id,
        power: entry.power,
        hint: "negative-contributor-power",
      })
    );
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
      message: negativesResult.reason?.message ?? String(negativesResult.reason),
    });
  }

  const decoratedTarget = {
    ...target,
    negativeDelegates: result.negativeDelegates,
  };

  await runWithConcurrency(contributors, options.concurrency, async (entry) => {
    try {
      const detail = await readVotes(decoratedTarget, entry.id);

      if (detail.value === entry.power) {
        result.matches += 1;
        return;
      }

      result.mismatches.push({
        address: entry.id,
        contributorPower: entry.power,
        detailPower: detail.value,
        detailSource: detail.source,
        delta: (BigInt(entry.power) - BigInt(detail.value)).toString(),
        hint: reasonHintForMismatch(
          decoratedTarget,
          entry.power,
          detail.value
        ),
      });
    } catch (error) {
      result.voteReadErrors.push({
        address: entry.id,
        hint: "detail-read-failed",
        message: error?.message ?? String(error),
      });
    }
  });

  return finalizeTargetResult(result);
}

function finalizeTargetResult(result) {
  return {
    ...result,
    anomalyCount:
      result.mismatches.length +
      result.voteReadErrors.length +
      result.negativeContributors.length +
      result.negativeDelegates.length +
      result.queryErrors.length,
  };
}

async function runAudit(targets, options, services = {}) {
  const generatedAt = new Date().toISOString();
  const targetResults = [];

  for (const target of targets) {
    const result = await auditTarget(target, options, services);
    targetResults.push(result);
  }

  const summary = summarizeAudit(targetResults);

  return {
    generatedAt,
    options: {
      concurrency: options.concurrency,
      limit: options.limit,
      negativeLimit: options.negativeLimit,
      targetsFile: options.targetsFile,
    },
    targets: targetResults,
    summary,
  };
}

function summarizeAudit(targetResults) {
  return targetResults.reduce(
    (summary, target) => ({
      checkedAccounts: summary.checkedAccounts + target.checkedAccounts,
      matches: summary.matches + target.matches,
      mismatches: summary.mismatches + target.mismatches.length,
      negativeContributors:
        summary.negativeContributors + target.negativeContributors.length,
      negativeDelegates:
        summary.negativeDelegates + target.negativeDelegates.length,
      queryErrors: summary.queryErrors + target.queryErrors.length,
      totalAnomalies: summary.totalAnomalies + target.anomalyCount,
      voteReadErrors:
        summary.voteReadErrors + target.voteReadErrors.length,
    }),
    {
      checkedAccounts: 0,
      matches: 0,
      mismatches: 0,
      negativeContributors: 0,
      negativeDelegates: 0,
      queryErrors: 0,
      totalAnomalies: 0,
      voteReadErrors: 0,
    }
  );
}

function buildMarkdownReport(report, targetsConfig) {
  const lines = [];
  lines.push("## Indexer Accuracy Audit");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("### Summary");
  lines.push("");
  lines.push(
    `- Checked accounts: ${report.summary.checkedAccounts}`
  );
  lines.push(`- Matches: ${report.summary.matches}`);
  lines.push(`- Vote mismatches: ${report.summary.mismatches}`);
  lines.push(`- Vote read errors: ${report.summary.voteReadErrors}`);
  lines.push(
    `- Negative contributor rows: ${report.summary.negativeContributors}`
  );
  lines.push(
    `- Negative delegate rows: ${report.summary.negativeDelegates}`
  );
  lines.push(`- Query errors: ${report.summary.queryErrors}`);
  lines.push(`- Total anomalies: ${report.summary.totalAnomalies}`);
  lines.push("");
  lines.push("| DAO | Checked | Matches | Mismatches | Read Errors | Negative Contributors | Negative Delegates | Query Errors |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");

  for (const target of report.targets) {
    lines.push(
      `| ${target.code} | ${target.checkedAccounts} | ${target.matches} | ${target.mismatches.length} | ${target.voteReadErrors.length} | ${target.negativeContributors.length} | ${target.negativeDelegates.length} | ${target.queryErrors.length} |`
    );
  }

  for (const target of report.targets) {
    const targetConfig = targetsConfig.find((entry) => entry.code === target.code);
    const decimals = targetConfig?.tokenDecimals ?? 18;

    lines.push("");
    lines.push(`### ${target.name} (\`${target.code}\`)`);
    lines.push("");
    lines.push(`- Indexer endpoint: ${targetConfig?.indexerEndpoint ?? "unknown"}`);
    lines.push(`- Checked: ${target.checkedAccounts}/${target.limit}`);
    lines.push(`- Matches: ${target.matches}`);
    lines.push(`- Total anomalies: ${target.anomalyCount}`);

    if (target.queryErrors.length === 0) {
      lines.push("- Query errors: none");
    } else {
      lines.push("- Query errors:");
      for (const error of target.queryErrors) {
        lines.push(`  - \`${error.scope}\`: ${error.message}`);
      }
    }

    if (target.mismatches.length === 0) {
      lines.push("- Vote mismatches: none");
    } else {
      lines.push("- Vote mismatches:");
      for (const mismatch of target.mismatches) {
        lines.push(
          `  - ${mismatch.address}: index ${compactAmount(
            mismatch.contributorPower,
            decimals
          )}, chain ${compactAmount(mismatch.detailPower, decimals)}, delta ${compactDelta(
            mismatch.contributorPower,
            mismatch.detailPower,
            decimals
          )}, hint: \`${mismatch.hint}\``
        );
      }
    }

    if (target.voteReadErrors.length === 0) {
      lines.push("- Vote read errors: none");
    } else {
      lines.push("- Vote read errors:");
      for (const error of target.voteReadErrors) {
        lines.push(
          `  - ${error.address}: hint \`${error.hint}\`, message: ${error.message}`
        );
      }
    }

    if (target.negativeContributors.length === 0) {
      lines.push("- Negative contributor rows: none");
    } else {
      lines.push("- Negative contributor rows:");
      for (const entry of target.negativeContributors) {
        lines.push(
          `  - ${entry.address}: power ${compactAmount(
            entry.power,
            decimals
          )}, hint: \`${entry.hint}\``
        );
      }
    }

    if (target.negativeDelegates.length === 0) {
      lines.push("- Negative delegate rows: none");
    } else {
      lines.push("- Negative delegate rows:");
      for (const entry of target.negativeDelegates) {
        lines.push(
          `  - ${entry.id}: ${entry.fromDelegate} -> ${entry.toDelegate}, power ${compactAmount(
            entry.power,
            decimals
          )}, hint: \`${entry.hint}\``
        );
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

async function writeFileIfNeeded(filePath, content) {
  if (!filePath) {
    return;
  }

  const absolutePath = path.resolve(process.cwd(), filePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
}

function printConsoleSummary(report) {
  console.log("Indexer accuracy audit completed.");
  console.log(
    `Checked ${report.summary.checkedAccounts} accounts across ${report.targets.length} DAOs.`
  );
  console.log(
    `Matches: ${report.summary.matches}, mismatches: ${report.summary.mismatches}, read errors: ${report.summary.voteReadErrors}, negative contributors: ${report.summary.negativeContributors}, negative delegates: ${report.summary.negativeDelegates}, query errors: ${report.summary.queryErrors}.`
  );

  for (const target of report.targets) {
    console.log(
      `${target.code}: checked=${target.checkedAccounts}, matches=${target.matches}, mismatches=${target.mismatches.length}, readErrors=${target.voteReadErrors.length}, negativeContributors=${target.negativeContributors.length}, negativeDelegates=${target.negativeDelegates.length}, queryErrors=${target.queryErrors.length}`
    );
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const targets = await loadTargets(
    options.targetsFile,
    options.auditConfigFile
  );
  const report = await runAudit(targets, options);
  const markdown = buildMarkdownReport(report, targets);

  await writeFileIfNeeded(options.jsonFile, JSON.stringify(report, null, 2));
  await writeFileIfNeeded(options.markdownFile, markdown);

  printConsoleSummary(report);

  if (options.failOnAnomalies && report.summary.totalAnomalies > 0) {
    process.exitCode = 1;
  }
}

module.exports = {
  auditTarget,
  buildMarkdownReport,
  compactAmount,
  compactDelta,
  fetchNegativeRows,
  fetchTopContributors,
  finalizeTargetResult,
  loadTargets,
  parseArgs,
  readCurrentVotes,
  reasonHintForMismatch,
  runAudit,
  summarizeAudit,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
