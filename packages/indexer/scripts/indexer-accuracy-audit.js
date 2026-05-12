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
      balance
      delegatesCountAll
      lastVoteTimestamp
    }
  }
`;

const AUDIT_CONTRIBUTORS_QUERY = `
  query AuditContributors($ids: [String!]!) {
    contributors(where: { id_in: $ids }) {
      id
      power
      balance
      delegatesCountAll
      lastVoteTimestamp
    }
  }
`;

const LATEST_POWER_CHECKPOINTS_QUERY = `
  query LatestPowerCheckpoints($accounts: [String!]!, $limit: Int!) {
    votePowerCheckpoints(
      limit: $limit
      orderBy: [blockNumber_DESC, logIndex_DESC]
      where: { account_in: $accounts }
    ) {
      account
      source
      timepoint
      blockNumber
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
  "function getPastVotes(address,uint256) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
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
  targetsFile: path.resolve(__dirname, "indexer-accuracy-targets.yaml"),
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

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "degov-indexer-accuracy-audit",
      accept: "application/json",
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Request failed for ${url}: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "degov-indexer-accuracy-audit",
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Request failed for ${url}: ${response.status} ${response.statusText}`
    );
  }

  return response.text();
}

async function fetchStructured(url, headers = {}) {
  const raw = await fetchText(url, headers);
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.endsWith(".yaml") || lowerUrl.endsWith(".yml")) {
    return YAML.parse(raw);
  }

  try {
    return JSON.parse(raw);
  } catch {
    return YAML.parse(raw);
  }
}

function buildTargetFromDaoConfig(config) {
  const rpcUrl = config.chain?.rpcs?.[0];
  const governor = config.contracts?.governor;
  const governorToken = config.contracts?.governorToken?.address;
  const indexerEndpoint = config.indexer?.endpoint;

  if (!config.code || !rpcUrl || !governor || !governorToken || !indexerEndpoint) {
    return null;
  }

  return normalizeTarget({
    code: config.code,
    name: config.name ?? config.code,
    indexerEndpoint,
    rpcUrl,
    governor,
    governorToken,
    tokenDecimals: config.contracts?.governorToken?.decimals ?? 18,
  });
}

async function resolveExtendedTarget(target) {
  if (!target.extend) {
    return normalizeTarget({
      ...target,
      indexerEndpoint: target.indexerEndpoint ?? target.indexer,
    });
  }

  const remoteConfig = await fetchStructured(target.extend);
  const remoteTarget = buildTargetFromDaoConfig(remoteConfig);
  if (!remoteTarget) {
    throw new Error(`Extended target is missing required fields: ${target.extend}`);
  }

  return normalizeTarget({
    ...remoteTarget,
    ...target,
    indexerEndpoint:
      target.indexerEndpoint ?? target.indexer ?? remoteTarget.indexerEndpoint,
  });
}

function isInlineConfiguredTarget(target) {
  return Boolean(
    target &&
      (target.code || target.name) &&
      (target.indexerEndpoint || target.indexer) &&
      target.rpcUrl &&
      target.governor &&
      target.governorToken
  );
}

function resolveConfiguredTarget(baseTargets, configuredTarget) {
  if (isInlineConfiguredTarget(configuredTarget)) {
    const limit = parseOptionalPositiveInt(configuredTarget.limit, "limit");
    const negativeLimit = parseOptionalPositiveInt(
      configuredTarget.negativeLimit,
      "negativeLimit"
    );

    return {
      ...normalizeTarget({
        ...configuredTarget,
        indexerEndpoint:
          configuredTarget.indexerEndpoint ?? configuredTarget.indexer,
      }),
      ...(limit !== undefined ? { limit } : {}),
      ...(negativeLimit !== undefined
        ? { negativeLimit }
        : limit !== undefined
          ? { negativeLimit: limit }
          : {}),
    };
  }

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
  if (!auditConfigFile) {
    const raw = await fs.readFile(targetsFile, "utf8");
    const targets = parseStructuredFile(raw, targetsFile);

    if (!Array.isArray(targets) || targets.length === 0) {
      throw new Error("Targets file must contain a non-empty array");
    }

    return Promise.all(targets.map((target) => resolveExtendedTarget(target)));
  }

  const auditConfigRaw = await fs.readFile(auditConfigFile, "utf8");
  const auditConfig = parseStructuredFile(auditConfigRaw, auditConfigFile);

  if (!Array.isArray(auditConfig) || auditConfig.length === 0) {
    throw new Error("Audit config file must contain a non-empty array");
  }

  if (
    auditConfig.every(
      (configuredTarget) =>
        isInlineConfiguredTarget(configuredTarget) || configuredTarget.extend
    )
  ) {
    const inlineTargets = await Promise.all(
      auditConfig.map((configuredTarget) =>
        resolveExtendedTarget(configuredTarget)
      )
    );
    return inlineTargets.map((configuredTarget) =>
      resolveConfiguredTarget([], configuredTarget)
    );
  }

  const raw = await fs.readFile(targetsFile, "utf8");
  const targets = parseStructuredFile(raw, targetsFile);

  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error("Targets file must contain a non-empty array");
  }

  const baseTargets = await Promise.all(
    targets.map((target) => resolveExtendedTarget(target))
  );

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

  const contributors = [...(data.contributors ?? [])];
  const auditAccounts = (target.auditAccounts ?? [])
    .map((account) => String(account).toLowerCase())
    .filter(Boolean);

  if (auditAccounts.length > 0) {
    const auditData = await graphqlRequest(
      target.indexerEndpoint,
      AUDIT_CONTRIBUTORS_QUERY,
      { ids: auditAccounts }
    );
    const byId = new Map(contributors.map((entry) => [entry.id.toLowerCase(), entry]));
    for (const entry of auditData.contributors ?? []) {
      byId.set(entry.id.toLowerCase(), entry);
    }
    for (const account of auditAccounts) {
      if (!byId.has(account)) {
        byId.set(account, {
          id: account,
          power: "0",
          balance: null,
          auditMissing: true,
        });
      }
    }
    return [...byId.values()];
  }

  return contributors;
}

async function fetchLatestPowerCheckpointSources(target, accounts) {
  const normalizedAccounts = [...new Set(accounts.map((account) => account.toLowerCase()))];
  if (normalizedAccounts.length === 0) {
    return {};
  }

  const data = await graphqlRequest(
    target.indexerEndpoint,
    LATEST_POWER_CHECKPOINTS_QUERY,
    {
      accounts: normalizedAccounts,
      limit: normalizedAccounts.length * 4,
    }
  );
  const checkpoints = {};
  for (const checkpoint of data.votePowerCheckpoints ?? []) {
    const account = checkpoint.account.toLowerCase();
    if (checkpoints[account]) {
      continue;
    }
    checkpoints[account] = {
      source: checkpoint.source ?? "unknown",
      timepoint: checkpoint.timepoint,
      blockNumber: checkpoint.blockNumber,
    };
  }

  return checkpoints;
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

async function readCurrentPowerDetail(
  target,
  address,
  checkpoint = {},
  client = createClient(target)
) {
  let powerDetail;
  try {
    if (checkpoint.timepoint) {
      const votes = await client.readContract({
        address: target.governorToken,
        abi: ERC20_VOTES_ABI,
        functionName: "getPastVotes",
        args: [address, BigInt(checkpoint.timepoint)],
      });
      powerDetail = {
        source: "token.getPastVotes",
        value: votes.toString(),
      };
    } else {
      const votes = await client.readContract({
        address: target.governorToken,
        abi: ERC20_VOTES_ABI,
        functionName: "getVotes",
        args: [address],
      });

      powerDetail = {
        source: "token.getVotes",
        value: votes.toString(),
      };
    }
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

    powerDetail = {
      source: "governor.getVotes",
      value: votes.toString(),
    };
  }

  const balance = await client.readContract({
    address: target.governorToken,
    abi: ERC20_VOTES_ABI,
    functionName: "balanceOf",
    args: [address],
  });

  return {
    ...powerDetail,
    balance: balance.toString(),
  };
}

async function readCurrentVotes(target, address, client = createClient(target)) {
  return readCurrentPowerDetail(target, address, {}, client);
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
  const fetchCheckpointSources =
    services.fetchLatestPowerCheckpointSources ?? fetchLatestPowerCheckpointSources;
  const fetchNegatives = services.fetchNegativeRows ?? fetchNegativeRows;
  const readVotes =
    services.readPowerDetail ?? services.readCurrentVotes ?? readCurrentPowerDetail;
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
  const latestCheckpointSources = await fetchCheckpointSources(
    target,
    contributors.map((entry) => entry.id)
  );

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
      const checkpoint = latestCheckpointSources[entry.id.toLowerCase()];
      const detail = await readVotes(decoratedTarget, entry.id, checkpoint);

      if (detail.value === entry.power) {
        result.matches += 1;
        return;
      }

      result.mismatches.push({
        address: entry.id,
        contributorPower: entry.power,
        contributorBalance: entry.balance,
        detailPower: detail.value,
        detailBalance: detail.balance,
        detailSource: detail.source,
        latestCheckpointSource: checkpoint?.source,
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
          )}, chain ${compactAmount(mismatch.detailPower, decimals)}, balance ${mismatch.contributorBalance ?? "unknown"} -> ${mismatch.detailBalance ?? "unknown"}, source ${mismatch.latestCheckpointSource ?? mismatch.detailSource}, delta ${compactDelta(
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
  fetchLatestPowerCheckpointSources,
  fetchNegativeRows,
  fetchTopContributors,
  finalizeTargetResult,
  loadTargets,
  parseArgs,
  readCurrentPowerDetail,
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
