#!/usr/bin/env node

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

const OVERVIEW_QUERY = `
  query DiagnoseOverview($address: String!, $mappingLimit: Int!, $negativeLimit: Int!) {
    contributors(where: { id_eq: $address }) {
      id
      power
      balance
      delegatesCountAll
      lastVoteTimestamp
      lastVoteBlockNumber
      blockNumber
      transactionHash
    }
    delegateMappings(limit: $mappingLimit, orderBy: [power_DESC, blockNumber_DESC], where: { to_eq: $address }) {
      id
      from
      to
      power
      blockNumber
      transactionHash
    }
    delegates(limit: $negativeLimit, orderBy: [power_ASC, blockNumber_DESC], where: { OR: [{ toDelegate_eq: $address, power_lt: 0 }, { fromDelegate_eq: $address, power_lt: 0 }] }) {
      id
      fromDelegate
      toDelegate
      power
      isCurrent
      blockNumber
      transactionHash
    }
  }
`;

export function parseArgs(argv) {
  const options = {
    address: "",
    code: "",
    concurrency: 10,
    databaseUrl: process.env.DEGOV_INDEXER_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
    endpoint: "",
    governor: "",
    governorToken: "",
    json: false,
    mappingLimit: 250,
    negativeLimit: 100,
    rpcUrl: "",
    targetsFile: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      options.json = true;
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
      case "--address":
        options.address = value.toLowerCase();
        break;
      case "--code":
      case "--dao":
        options.code = value;
        break;
      case "--concurrency":
        options.concurrency = parsePositiveInt(value, "--concurrency");
        break;
      case "--database-url":
        options.databaseUrl = value;
        break;
      case "--endpoint":
        options.endpoint = value;
        break;
      case "--governor":
        options.governor = value;
        break;
      case "--governor-token":
      case "--token":
        options.governorToken = value;
        break;
      case "--mapping-limit":
        options.mappingLimit = parsePositiveInt(value, "--mapping-limit");
        break;
      case "--negative-limit":
        options.negativeLimit = parsePositiveInt(value, "--negative-limit");
        break;
      case "--rpc-url":
        options.rpcUrl = value;
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
  if (!options.help && !options.address) {
    throw new Error("--address is required");
  }
  return options;
}

export async function resolveTarget(options) {
  const targets = await loadTargets(options.targetsFile || undefined).catch(() => []);
  const matchedTarget = targets.find((target) => {
    return (
      (options.code && target.code === options.code) ||
      (options.endpoint && target.indexerEndpoint === options.endpoint)
    );
  });
  const target = {
    ...(matchedTarget ?? {}),
    ...(options.code ? { code: options.code } : {}),
    ...(options.endpoint ? { indexerEndpoint: options.endpoint } : {}),
    ...(options.governor ? { governor: options.governor } : {}),
    ...(options.governorToken ? { governorToken: options.governorToken } : {}),
    ...(options.rpcUrl ? { rpcUrl: options.rpcUrl } : {}),
  };
  for (const [field, hint] of [
    ["indexerEndpoint", "--code or --endpoint"],
    ["rpcUrl", "--code or --rpc-url"],
    ["governorToken", "--code or --governor-token"],
  ]) {
    if (!target[field]) {
      throw new Error(`Unable to resolve ${field}. Pass ${hint}.`);
    }
  }
  return target;
}

export async function diagnoseAddress(options, services = {}) {
  const target = services.target ?? (await resolveTarget(options));
  const query = services.graphqlRequest ?? graphqlRequest;
  const readVotes = services.readCurrentVotes ?? readCurrentVotes;
  const readBalance = services.readTokenBalance ?? readTokenBalance;
  const status =
    services.status ?? (await readDatalensStatus(options.databaseUrl));
  let overview;
  try {
    overview = await query(target.indexerEndpoint, OVERVIEW_QUERY, {
      address: options.address,
      mappingLimit: options.mappingLimit,
      negativeLimit: options.negativeLimit,
    });
  } catch (error) {
    return {
      target,
      address: options.address,
      queryError: {
        classification: classifyDatalensQueryError(error),
        message: error.message ?? String(error),
      },
      status,
    };
  }
  const contributor = overview.contributors?.[0] ?? null;
  let chainVotes = null;
  let tokenBalance = null;
  let chainReadError = null;
  try {
    [chainVotes, tokenBalance] = await Promise.all([
      readVotes(target, options.address),
      readBalance(target, options.address).catch(() => null),
    ]);
  } catch (error) {
    chainReadError = {
      classification: classifyDatalensQueryError(error),
      message: error.message ?? String(error),
    };
  }

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
    address: options.address,
    contributor,
    chainVotes,
    tokenBalance,
    chainReadError,
    contributorDelta:
      contributor && chainVotes
        ? (BigInt(contributor.power) - BigInt(chainVotes.value)).toString()
        : null,
    projectionClassification:
      contributor && chainVotes
        ? classifyProjectionMismatch({
            indexed: contributor.power,
            chain: chainVotes.value,
            source: "onchain-power",
          })
        : null,
    incomingMappings: overview.delegateMappings ?? [],
    negativeDelegates: overview.delegates ?? [],
    status,
  };
}

export function printHumanReport(report) {
  if (report.queryError) {
    console.log(`Query error: ${report.queryError.classification}`);
    console.log(report.queryError.message);
    return;
  }
  const decimals = report.target.tokenDecimals ?? 18;
  console.log(`DAO: ${report.target.code}`);
  console.log(`Address: ${report.address}`);
  console.log(`Endpoint: ${report.target.indexerEndpoint}`);
  console.log(
    `DeGov power: ${
      report.contributor ? compactAmount(report.contributor.power, decimals) : "missing"
    }`,
  );
  console.log(
    `Chain power: ${
      report.chainVotes
        ? `${compactAmount(report.chainVotes.value, decimals)} (${report.chainVotes.source})`
        : "unavailable"
    }`,
  );
  console.log(`Projection: ${report.projectionClassification ?? "match-or-missing"}`);
  console.log(`Incoming mappings: ${report.incomingMappings.length}`);
  console.log(`Negative delegates touching address: ${report.negativeDelegates.length}`);
  console.log(`Checkpoint stalls: ${report.status.checkpointStalls.length}`);
  console.log(
    `Onchain refresh backlog: ${JSON.stringify(report.status.onchainRefreshBacklog)}`,
  );
  if (report.chainReadError) {
    console.log(`Chain read error: ${report.chainReadError.classification}`);
    console.log(report.chainReadError.message);
  }
}

export function usage() {
  return [
    "Usage: node apps/indexer/scripts/indexer-accuracy-diagnose.mjs --address <address> [options]",
    "",
    "Options:",
    "  --code <dao>              DAO code from targets JSON",
    "  --endpoint <url>          DeGov GraphQL endpoint",
    "  --rpc-url <url>           Chain RPC URL",
    "  --governor-token <addr>   Votes token contract",
    "  --governor <addr>         Optional governor fallback",
    "  --database-url <url>      Optional read-only Postgres URL for Datalens status",
    "  --json                    Print JSON report",
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const report = await diagnoseAddress(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  printHumanReport(report);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
