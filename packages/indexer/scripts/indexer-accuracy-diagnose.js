const path = require("node:path");
const {
  createPublicClient,
  formatUnits,
  http,
  parseAbi,
  zeroAddress,
} = require("viem");
const {
  compactAmount,
  loadTargets,
  readCurrentVotes,
} = require("./indexer-accuracy-audit");

const BALANCE_AND_DELEGATE_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function delegates(address) view returns (address)",
]);

const DEFAULT_OPTIONS = {
  address: "",
  code: "",
  endpoint: "",
  rpcUrl: "",
  governor: "",
  governorToken: "",
  targetsFile: path.resolve(__dirname, "indexer-accuracy-targets.json"),
  mappingLimit: 500,
  negativeLimit: 200,
  historyLimit: 12,
  concurrency: 10,
  json: false,
};

const OVERVIEW_QUERY = `
  query DiagnoseOverview(
    $address: String!
    $mappingLimit: Int!
    $negativeLimit: Int!
  ) {
    contributors(where: { id_eq: $address }) {
      id
      power
      delegatesCountAll
      delegatesCountEffective
      lastVoteTimestamp
      lastVoteBlockNumber
      blockNumber
      transactionHash
    }
    delegateMappings(
      limit: $mappingLimit
      orderBy: [power_DESC, blockNumber_DESC]
      where: { to_eq: $address }
    ) {
      id
      from
      to
      power
      blockNumber
      transactionHash
    }
    delegates(
      limit: $negativeLimit
      orderBy: [power_ASC, blockNumber_DESC]
      where: {
        OR: [
          { toDelegate_eq: $address, power_lt: 0 }
          { fromDelegate_eq: $address, power_lt: 0 }
        ]
      }
    ) {
      id
      fromDelegate
      toDelegate
      power
      isCurrent
      blockNumber
      transactionHash
    }
    negativeContributors: contributors(where: { id_eq: $address, power_lt: 0 }) {
      id
      power
      blockNumber
      transactionHash
    }
  }
`;

const DELEGATOR_HISTORY_QUERY = `
  query DelegatorHistory(
    $delegator: String!
    $delegateId: String!
    $historyLimit: Int!
  ) {
    delegateMappings(where: { from_eq: $delegator }) {
      id
      from
      to
      power
      blockNumber
      transactionHash
    }
    delegates(
      limit: $historyLimit
      orderBy: [blockNumber_DESC, logIndex_DESC]
      where: { fromDelegate_eq: $delegator }
    ) {
      id
      fromDelegate
      toDelegate
      power
      isCurrent
      blockNumber
      transactionHash
    }
    focusRelation: delegates(where: { id_eq: $delegateId }) {
      id
      fromDelegate
      toDelegate
      power
      isCurrent
      blockNumber
      transactionHash
    }
    delegateChangeds(
      limit: $historyLimit
      orderBy: [blockNumber_DESC, logIndex_DESC]
      where: { delegator_eq: $delegator }
    ) {
      id
      delegator
      fromDelegate
      toDelegate
      blockNumber
      transactionHash
    }
    tokenTransfers(
      limit: $historyLimit
      orderBy: [blockNumber_DESC, logIndex_DESC]
      where: {
        OR: [{ from_eq: $delegator }, { to_eq: $delegator }]
      }
    ) {
      id
      from
      to
      value
      blockNumber
      transactionHash
    }
    votePowerCheckpoints(
      limit: $historyLimit
      orderBy: [blockNumber_DESC, logIndex_DESC]
      where: { delegator_eq: $delegator }
    ) {
      id
      account
      delegator
      fromDelegate
      toDelegate
      cause
      delta
      previousPower
      newPower
      blockNumber
      transactionHash
    }
  }
`;

function parseArgs(argv) {
  const options = { ...DEFAULT_OPTIONS };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--json") {
      options.json = true;
      continue;
    }

    if (!token.startsWith("--")) {
      continue;
    }

    const [flag, inlineValue] = token.split("=", 2);
    const value = inlineValue ?? argv[index + 1];
    const expectsValue = inlineValue === undefined;

    switch (flag) {
      case "--address":
        options.address = value.toLowerCase();
        break;
      case "--code":
      case "--dao":
        options.code = value;
        break;
      case "--endpoint":
        options.endpoint = value;
        break;
      case "--rpc-url":
        options.rpcUrl = value;
        break;
      case "--governor":
        options.governor = value;
        break;
      case "--governor-token":
      case "--token":
        options.governorToken = value;
        break;
      case "--mapping-limit":
        options.mappingLimit = Number.parseInt(value, 10);
        break;
      case "--negative-limit":
        options.negativeLimit = Number.parseInt(value, 10);
        break;
      case "--history-limit":
        options.historyLimit = Number.parseInt(value, 10);
        break;
      case "--concurrency":
        options.concurrency = Number.parseInt(value, 10);
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

  if (!options.address) {
    throw new Error("--address is required");
  }

  for (const field of [
    "mappingLimit",
    "negativeLimit",
    "historyLimit",
    "concurrency",
  ]) {
    if (!Number.isInteger(options[field]) || options[field] <= 0) {
      throw new Error(`--${field.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`)} must be a positive integer`);
    }
  }

  return options;
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
      `GraphQL request failed with HTTP ${response.status} ${response.statusText}`,
    );
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(
      payload.errors
        .map((error) => error.message || JSON.stringify(error))
        .join("; "),
    );
  }

  return payload.data;
}

async function resolveTarget(options) {
  const targets = await loadTargets(options.targetsFile);
  const matchedTarget = targets.find((target) => {
    if (options.code && target.code === options.code) {
      return true;
    }

    if (options.endpoint && target.indexerEndpoint === options.endpoint) {
      return true;
    }

    return false;
  });

  const target = {
    ...(matchedTarget ?? {}),
    ...(options.code ? { code: options.code } : {}),
    ...(options.endpoint ? { indexerEndpoint: options.endpoint } : {}),
    ...(options.rpcUrl ? { rpcUrl: options.rpcUrl } : {}),
    ...(options.governor ? { governor: options.governor } : {}),
    ...(options.governorToken ? { governorToken: options.governorToken } : {}),
  };

  if (!target.indexerEndpoint) {
    throw new Error(
      "Unable to resolve indexer endpoint. Pass --code or --endpoint.",
    );
  }
  if (!target.rpcUrl) {
    throw new Error(
      "Unable to resolve rpcUrl. Pass --code for a known target or provide --rpc-url.",
    );
  }
  if (!target.governorToken) {
    throw new Error(
      "Unable to resolve governor token. Pass --code for a known target or provide --governor-token.",
    );
  }

  return target;
}

async function runWithConcurrency(items, concurrency, worker) {
  const pending = new Set();
  const results = [];

  for (const item of items) {
    const task = Promise.resolve().then(() => worker(item));
    pending.add(task);
    results.push(task);

    const cleanup = () => pending.delete(task);
    task.then(cleanup, cleanup);

    if (pending.size >= concurrency) {
      await Promise.race(pending);
    }
  }

  return Promise.all(results);
}

function compactSignedAmount(rawValue, decimals) {
  const value = BigInt(rawValue);
  if (value === 0n) {
    return "0";
  }

  const sign = value > 0n ? "+" : "-";
  const absolute = value > 0n ? value : -value;
  return `${sign}${compactAmount(absolute.toString(), decimals)}`;
}

function classifyMappingAnomaly({
  indexedPower,
  chainBalance,
  chainDelegate,
  expectedDelegate,
}) {
  if (indexedPower < 0n) {
    return "negative-mapping-power";
  }
  if (chainDelegate !== expectedDelegate) {
    if (chainDelegate === zeroAddress) {
      return indexedPower === 0n
        ? "stale-zero-target"
        : "stale-target-after-undelegate";
    }

    return "stale-target-mismatch";
  }
  if (indexedPower === chainBalance) {
    return null;
  }
  if (chainBalance === 0n && indexedPower > 0n) {
    return "power-not-cleared-after-balance-zero";
  }
  if (indexedPower > chainBalance) {
    return "indexed-power-higher-than-balance";
  }

  return "indexed-power-lower-than-balance";
}

async function inspectMapping(target, address, mapping, client) {
  const [chainDelegate, chainBalance] = await Promise.all([
    client.readContract({
      address: target.governorToken,
      abi: BALANCE_AND_DELEGATE_ABI,
      functionName: "delegates",
      args: [mapping.from],
    }),
    client.readContract({
      address: target.governorToken,
      abi: BALANCE_AND_DELEGATE_ABI,
      functionName: "balanceOf",
      args: [mapping.from],
    }),
  ]);

  const normalizedChainDelegate = chainDelegate.toLowerCase();
  const anomaly = classifyMappingAnomaly({
    indexedPower: BigInt(mapping.power),
    chainBalance,
    chainDelegate: normalizedChainDelegate,
    expectedDelegate: address,
  });

  return {
    mapping,
    chain: {
      delegate: normalizedChainDelegate,
      balance: chainBalance.toString(),
    },
    anomaly,
    delta: (BigInt(mapping.power) - chainBalance).toString(),
    history: null,
  };
}

async function attachMappingHistory(target, address, entry, historyLimit) {
  if (!entry.anomaly) {
    return entry;
  }

  const history = await graphqlRequest(target.indexerEndpoint, DELEGATOR_HISTORY_QUERY, {
    delegator: entry.mapping.from,
    delegateId: `${entry.mapping.from}_${address}`,
    historyLimit,
  });

  return {
    ...entry,
    history,
  };
}

function buildSummary({
  target,
  contributor,
  chainVotes,
  negativeContributors,
  negativeDelegates,
  inspectedMappings,
  negativeDelegateAnalyses,
}) {
  const mismatchCount = inspectedMappings.filter(
    (entry) => entry.anomaly !== null,
  ).length;
  const explainedDelta = inspectedMappings.reduce((sum, entry) => {
    if (!entry.anomaly) {
      return sum;
    }
    return sum + BigInt(entry.delta);
  }, 0n);

  return {
    target: {
      code: target.code ?? "custom",
      name: target.name ?? target.code ?? "custom",
      indexerEndpoint: target.indexerEndpoint,
      rpcUrl: target.rpcUrl,
      governor: target.governor ?? null,
      governorToken: target.governorToken,
      tokenDecimals: target.tokenDecimals ?? 18,
    },
    contributor: contributor ?? null,
    chainVotes,
    contributorDelta: contributor
      ? (BigInt(contributor.power) - BigInt(chainVotes.value)).toString()
      : null,
    negativeContributors,
    negativeDelegates,
    negativeDelegateAnalyses,
    mappingChecks: {
      checked: inspectedMappings.length,
      mismatches: mismatchCount,
      explainedDelta: explainedDelta.toString(),
    },
    mismatchedMappings: inspectedMappings.filter((entry) => entry.anomaly),
  };
}

function collectNegativeDelegateSignals({
  row,
  currentMapping,
  history,
}) {
  const mappingPower = currentMapping ? BigInt(currentMapping.power) : null;
  const rowPower = BigInt(row.power);
  const noopChangesInSameTarget = (history.delegateChangeds ?? []).some(
    (item) =>
      item.fromDelegate?.toLowerCase() === item.toDelegate?.toLowerCase() &&
      item.toDelegate?.toLowerCase() === row.toDelegate.toLowerCase(),
  );
  const sameTargetDelegateChanges = (history.delegateChangeds ?? []).filter(
    (item) => item.toDelegate?.toLowerCase() === row.toDelegate.toLowerCase(),
  );
  const txsWithTransferAndDelegateChange = new Set(
    (history.tokenTransfers ?? []).map((item) => item.transactionHash),
  );
  const overlappingDelegateChangeCount = sameTargetDelegateChanges.filter(
    (item) => txsWithTransferAndDelegateChange.has(item.transactionHash),
  ).length;

  return {
    rowPower,
    mappingPower,
    noopChangesInSameTarget,
    sameTargetDelegateChangeCount: sameTargetDelegateChanges.length,
    overlappingDelegateChangeCount,
  };
}

function classifyNegativeDelegate({
  row,
  currentMapping,
  history,
}) {
  if (!currentMapping && row.isCurrent) {
    return "negative-current-delegate-without-mapping";
  }
  if (!currentMapping) {
    return "negative-historical-delegate-without-mapping";
  }

  const {
    rowPower,
    mappingPower,
    noopChangesInSameTarget,
    overlappingDelegateChangeCount,
  } = collectNegativeDelegateSignals({
    row,
    currentMapping,
    history,
  });

  if (mappingPower === 0n && row.isCurrent) {
    return "current-delegate-drift-after-mapping-zeroed";
  }
  if (
    mappingPower < 0n &&
    (noopChangesInSameTarget || overlappingDelegateChangeCount > 0)
  ) {
    return "negative-mapping-from-tx-local-rolling-mismatch";
  }
  if (
    mappingPower > 0n &&
    row.isCurrent &&
    currentMapping.to?.toLowerCase() === row.toDelegate.toLowerCase()
  ) {
    return "current-delegate-drift-below-current-mapping";
  }
  if (mappingPower === rowPower) {
    return "negative-mapping-power";
  }

  return "negative-delegate-needs-manual-review";
}

async function inspectNegativeDelegate(target, row, historyLimit) {
  const history = await graphqlRequest(
    target.indexerEndpoint,
    DELEGATOR_HISTORY_QUERY,
    {
      delegator: row.fromDelegate,
      delegateId: row.id,
      historyLimit,
    },
  );
  const currentMapping = history.delegateMappings?.[0] ?? null;

  return {
    row,
    currentMapping,
    signals: collectNegativeDelegateSignals({
      row,
      currentMapping,
      history,
    }),
    classification: classifyNegativeDelegate({
      row,
      currentMapping,
      history,
    }),
    history,
  };
}

function printSection(title, lines) {
  console.log(`\n## ${title}`);
  for (const line of lines) {
    console.log(line);
  }
}

function printHumanReport(report) {
  const decimals = report.target.tokenDecimals ?? 18;
  printSection("Target", [
    `DAO: ${report.target.code}`,
    `Indexer endpoint: ${report.target.indexerEndpoint}`,
    `RPC: ${report.target.rpcUrl}`,
    `Governor token: ${report.target.governorToken}`,
  ]);

  const contributor = report.contributor;
  printSection("Voting Power", [
    `Indexer contributor: ${contributor ? compactAmount(contributor.power, decimals) : "missing"}`,
    `Chain votes: ${compactAmount(report.chainVotes.value, decimals)} (${report.chainVotes.source})`,
    `Delta: ${report.contributorDelta ? compactSignedAmount(report.contributorDelta, decimals) : "n/a"}`,
  ]);

  printSection("Negative Rows", [
    `Negative contributor rows: ${report.negativeContributors.length}`,
    `Negative delegate rows touching address: ${report.negativeDelegates.length}`,
  ]);

  if ((report.negativeDelegateAnalyses ?? []).length > 0) {
    printSection(
      "Negative Delegate Analyses",
      report.negativeDelegateAnalyses.map((entry) => {
        const mapping = entry.currentMapping;
        const mappingText = mapping
          ? `${mapping.from} -> ${mapping.to} power ${compactAmount(mapping.power, decimals)}`
          : "missing";
        const signals = entry.signals ?? {};
        const signalText = [
          signals.noopChangesInSameTarget ? "noop-same-target=yes" : null,
          Number.isInteger(signals.sameTargetDelegateChangeCount)
            ? `same-target-dc=${signals.sameTargetDelegateChangeCount}`
            : null,
          Number.isInteger(signals.overlappingDelegateChangeCount)
            ? `transfer-overlap-dc=${signals.overlappingDelegateChangeCount}`
            : null,
        ]
          .filter(Boolean)
          .join(", ");
        return `- ${entry.row.fromDelegate} -> ${entry.row.toDelegate}: row ${compactAmount(entry.row.power, decimals)}, mapping ${mappingText}, hint ${entry.classification}${signalText ? `, signals ${signalText}` : ""}`;
      }),
    );
  }

  printSection("Mapping Checks", [
    `Incoming mappings checked: ${report.mappingChecks.checked}`,
    `Mismatched mappings: ${report.mappingChecks.mismatches}`,
    `Explained delta from mismatched mappings: ${compactSignedAmount(report.mappingChecks.explainedDelta, decimals)}`,
  ]);

  if (report.mismatchedMappings.length === 0) {
    printSection("Suspects", ["No mismatched current incoming mappings found."]);
    return;
  }

  const lines = [];
  for (const entry of report.mismatchedMappings) {
    lines.push(
      `- ${entry.mapping.from} -> ${entry.mapping.to}: index ${compactAmount(entry.mapping.power, decimals)}, chain balance ${compactAmount(entry.chain.balance, decimals)}, chain delegate ${entry.chain.delegate}, delta ${compactSignedAmount(entry.delta, decimals)}, hint ${entry.anomaly}`,
    );
    const history = entry.history;
    const latestDelegateChange = history.delegateChangeds?.[0];
    const latestTransfer = history.tokenTransfers?.[0];
    if (latestDelegateChange) {
      lines.push(
        `  latest delegate change: block ${latestDelegateChange.blockNumber} tx ${latestDelegateChange.transactionHash} ${latestDelegateChange.fromDelegate} -> ${latestDelegateChange.toDelegate}`,
      );
    }
    if (latestTransfer) {
      lines.push(
        `  latest transfer: block ${latestTransfer.blockNumber} tx ${latestTransfer.transactionHash} ${latestTransfer.from} -> ${latestTransfer.to} value ${compactAmount(latestTransfer.value, decimals)}`,
      );
    }
    const latestCheckpoint = history.votePowerCheckpoints?.[0];
    if (latestCheckpoint) {
      lines.push(
        `  latest checkpoint: block ${latestCheckpoint.blockNumber} tx ${latestCheckpoint.transactionHash} cause ${latestCheckpoint.cause} delta ${compactSignedAmount(latestCheckpoint.delta, decimals)}`,
      );
    }
  }
  printSection("Suspects", lines);
}

async function diagnoseAddress(options) {
  const target = await resolveTarget(options);
  const client = createPublicClient({
    transport: http(target.rpcUrl),
  });

  const overview = await graphqlRequest(target.indexerEndpoint, OVERVIEW_QUERY, {
    address: options.address,
    mappingLimit: options.mappingLimit,
    negativeLimit: options.negativeLimit,
  });
  const contributor = overview.contributors?.[0];
  const chainVotes = await readCurrentVotes(target, options.address, client);
  const mappings = overview.delegateMappings ?? [];

  const inspectedMappings = await runWithConcurrency(
    mappings,
    options.concurrency,
    (mapping) => inspectMapping(target, options.address, mapping, client),
  );
  const enrichedMappings = await runWithConcurrency(
    inspectedMappings,
    options.concurrency,
    (entry) =>
      attachMappingHistory(
        target,
        options.address,
        entry,
        options.historyLimit,
      ),
  );
  const negativeDelegateAnalyses = await runWithConcurrency(
    overview.delegates ?? [],
    options.concurrency,
    (row) => inspectNegativeDelegate(target, row, options.historyLimit),
  );

  return buildSummary({
    target,
    contributor,
    chainVotes,
    negativeContributors: overview.negativeContributors ?? [],
    negativeDelegates: overview.delegates ?? [],
    inspectedMappings: enrichedMappings,
    negativeDelegateAnalyses,
  });
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const report = await diagnoseAddress(options);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printHumanReport(report);
}

module.exports = {
  classifyMappingAnomaly,
  classifyNegativeDelegate,
  collectNegativeDelegateSignals,
  diagnoseAddress,
  parseArgs,
  resolveTarget,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
