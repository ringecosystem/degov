#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_TARGETS_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "indexer-accuracy-targets.json",
);

export function parsePositiveInt(value, fieldName) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return parsed;
}

export function normalizeAddress(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function requireOptionValue(flag, value) {
  if (value === undefined || String(value).startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function classifyDatalensQueryError(error) {
  const message = String(error?.message ?? error ?? "");
  const lower = message.toLowerCase();

  if (
    lower.includes("decode") ||
    lower.includes("invalid data") ||
    lower.includes("abi") ||
    lower.includes("overflow") ||
    lower.includes("cannot parse")
  ) {
    return "decode-error";
  }
  if (
    lower.includes("field") ||
    lower.includes("column") ||
    lower.includes("relation") ||
    lower.includes("does not exist") ||
    lower.includes("unknown argument")
  ) {
    return "projection-mismatch";
  }
  if (
    lower.includes("datalens") ||
    lower.includes("native/graphql") ||
    lower.includes("native query") ||
    lower.includes("query failed")
  ) {
    return "datalens-query-error";
  }
  if (
    lower.includes("timeout") ||
    lower.includes("econnreset") ||
    lower.includes("429") ||
    lower.includes("rate limit")
  ) {
    return "transport-error";
  }

  return "unknown-query-error";
}

export function classifyProjectionMismatch({ indexed, chain, source = "chain" }) {
  if (indexed === null || indexed === undefined) {
    return `${source}-missing-indexed-row`;
  }
  if (chain === null || chain === undefined) {
    return `${source}-missing-reference-row`;
  }

  const indexedValue = BigInt(indexed);
  const chainValue = BigInt(chain);
  if (indexedValue === chainValue) {
    return null;
  }
  return indexedValue > chainValue
    ? `${source}-indexed-higher`
    : `${source}-indexed-lower`;
}

export function summarizeCheckpointRows(rows, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const stallMinutes = options.stallMinutes ?? 15;
  return rows.map((row) => {
    const processedHeight = row.processed_height ?? row.processedHeight ?? null;
    const targetHeight = row.target_height ?? row.targetHeight ?? null;
    const nextBlock = row.next_block ?? row.nextBlock ?? null;
    const updatedAt = row.updated_at ?? row.updatedAt ?? null;
    const updatedMs = updatedAt ? Date.parse(updatedAt) : Number.NaN;
    const ageMinutes = Number.isFinite(updatedMs)
      ? Math.max(0, Math.floor((nowMs - updatedMs) / 60000))
      : null;
    const lagBlocks =
      targetHeight === null || processedHeight === null
        ? null
        : (BigInt(targetHeight) - BigInt(processedHeight)).toString();
    const stalled =
      ageMinutes !== null &&
      ageMinutes >= stallMinutes &&
      (lagBlocks === null || BigInt(lagBlocks) > 0n);

    const lastError = row.last_error ?? row.lastError ?? null;
    return {
      daoCode: row.dao_code ?? row.daoCode ?? null,
      chainId: row.chain_id ?? row.chainId ?? null,
      streamId: row.stream_id ?? row.streamId ?? null,
      dataSourceVersion:
        row.data_source_version ?? row.dataSourceVersion ?? null,
      nextBlock: nextBlock === null ? null : String(nextBlock),
      processedHeight:
        processedHeight === null ? null : String(processedHeight),
      targetHeight: targetHeight === null ? null : String(targetHeight),
      lagBlocks,
      updatedAt,
      ageMinutes,
      stalled,
      lastError,
      lockOwner: row.lock_owner ?? row.lockOwner ?? null,
      lockedAt: row.locked_at ?? row.lockedAt ?? null,
      classification: lastError
        ? classifyDatalensQueryError(lastError)
        : stalled
          ? "checkpoint-stall"
          : "checkpoint-ok",
    };
  });
}

export function summarizeStatusTables({
  checkpoints = [],
  reconcileTasks = [],
  refreshTasks = [],
  legacyStatus = null,
} = {}) {
  const checkpointRows = summarizeCheckpointRows(checkpoints);
  const countByStatus = (rows) =>
    rows.reduce((counts, row) => {
      const status = String(row.status ?? "unknown");
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {});
  const classifyTaskErrors = (rows) =>
    rows
      .filter((row) => row.error)
      .map((row) => ({
        id: row.id,
        status: row.status,
        attempts: row.attempts,
        classification: classifyDatalensQueryError(row.error),
        error: row.error,
      }));

  return {
    checkpoints: checkpointRows,
    checkpointStalls: checkpointRows.filter((row) => row.stalled),
    checkpointErrors: checkpointRows.filter((row) => row.lastError),
    reconcileBacklog: countByStatus(reconcileTasks),
    reconcileErrors: classifyTaskErrors(reconcileTasks),
    onchainRefreshBacklog: countByStatus(refreshTasks),
    onchainRefreshErrors: classifyTaskErrors(refreshTasks),
    legacySquidStatus: legacyStatus,
  };
}

export async function graphqlRequest(endpoint, query, variables = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
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

export async function rpcCall(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC ${method} failed with HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message || JSON.stringify(payload.error));
  }
  return payload.result;
}

export function encodeAddressArgument(address) {
  return normalizeAddress(address).replace(/^0x/, "").padStart(64, "0");
}

export function formatBlockTag(blockHeight) {
  if (blockHeight === null || blockHeight === undefined || blockHeight === "") {
    return "latest";
  }
  if (typeof blockHeight === "string" && blockHeight.startsWith("0x")) {
    return blockHeight;
  }
  return `0x${BigInt(blockHeight).toString(16)}`;
}

export function findTargetComparisonBlock(target, status) {
  const checkpoints = status?.checkpoints ?? [];
  const matching = checkpoints.filter((checkpoint) => {
    return (
      checkpoint.daoCode === target.code ||
      checkpoint.dao_code === target.code ||
      (target.chainId !== undefined &&
        target.chainId !== null &&
        (checkpoint.chainId === target.chainId ||
          checkpoint.chain_id === target.chainId))
    );
  });
  const heights = matching
    .map((checkpoint) => checkpoint.processedHeight ?? checkpoint.processed_height)
    .filter((height) => height !== null && height !== undefined);
  if (heights.length === 0) {
    return null;
  }
  return heights.reduce((lowest, height) =>
    BigInt(height) < BigInt(lowest) ? String(height) : String(lowest),
  );
}

export async function readUint256(rpcUrl, contract, selector, args = [], blockTag = "latest") {
  const data = `${selector}${args.join("")}`;
  const result = await rpcCall(rpcUrl, "eth_call", [
    { to: contract, data },
    blockTag,
  ]);
  if (!result || result === "0x") {
    throw new Error("decode error: eth_call returned no data");
  }
  return BigInt(result).toString();
}

export async function readCurrentVotes(target, address) {
  const account = encodeAddressArgument(address);
  const blockTag = formatBlockTag(target.comparisonBlockHeight ?? target.blockTag);
  try {
    return {
      source: "token.getVotes",
      value: await readUint256(
        target.rpcUrl,
        target.governorToken,
        "0x9ab24eb0",
        [account],
        blockTag,
      ),
    };
  } catch (tokenError) {
    try {
      return {
        source: "token.getCurrentVotes",
        value: await readUint256(
          target.rpcUrl,
          target.governorToken,
          "0xb58131b0",
          [account],
          blockTag,
        ),
      };
    } catch {
      // Continue to the governor fallback below when available.
    }
    if (!target.governor) {
      throw tokenError;
    }
    const blockNumber =
      target.comparisonBlockHeight === null ||
      target.comparisonBlockHeight === undefined
        ? BigInt(await rpcCall(target.rpcUrl, "eth_blockNumber", []))
        : BigInt(target.comparisonBlockHeight);
    const timepoint = (blockNumber > 1n ? blockNumber - 1n : blockNumber)
      .toString(16)
      .padStart(64, "0");
    return {
      source: "governor.getVotes",
      value: await readUint256(
        target.rpcUrl,
        target.governor,
        "0xeb9019d4",
        [account, timepoint],
        blockTag,
      ),
    };
  }
}

export async function readTokenBalance(target, address) {
  const blockTag = formatBlockTag(target.comparisonBlockHeight ?? target.blockTag);
  return readUint256(target.rpcUrl, target.governorToken, "0x70a08231", [
    encodeAddressArgument(address),
  ], blockTag);
}

export function compactAmount(rawValue, decimals = 18) {
  const value = BigInt(rawValue);
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = value >= 0n ? value % divisor : (-value) % divisor;
  if (whole !== 0n) {
    return whole.toString();
  }
  if (fraction === 0n) {
    return "0";
  }
  return value < 0n ? "-0" : "0";
}

export async function loadTargets(targetsFile = DEFAULT_TARGETS_FILE) {
  const raw = await readFile(targetsFile, "utf8");
  const targets = JSON.parse(raw);
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error("Targets file must contain a non-empty JSON array");
  }
  return targets.map((target) => ({
    tokenDecimals: 18,
    ...target,
    indexerEndpoint: target.indexerEndpoint ?? target.indexer,
  }));
}

export async function queryPostgres(databaseUrl, sql) {
  if (!databaseUrl) {
    return [];
  }

  return new Promise((resolve, reject) => {
    const child = spawn("psql", [
      databaseUrl,
      "--no-align",
      "--tuples-only",
      "--csv",
      "--command",
      sql,
    ]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      if (status !== 0) {
        reject(new Error(stderr.trim() || `psql exited with ${status}`));
        return;
      }
      resolve(parseCsvRows(stdout));
    });
  });
}

function parseCsvRows(raw) {
  const lines = raw.trim().split("\n").filter(Boolean);
  return lines.map((line) => {
    const [payload] = parseCsvLine(line);
    return payload ? JSON.parse(payload) : {};
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

export async function readDatalensStatus(databaseUrl) {
  if (!databaseUrl) {
    return summarizeStatusTables();
  }

  const [checkpoints, reconcileTasks, refreshTasks, legacyStatus] =
    await Promise.all([
      queryPostgres(
        databaseUrl,
        "SELECT row_to_json(t) FROM (SELECT dao_code, chain_id, stream_id, data_source_version, next_block::TEXT, processed_height::TEXT, target_height::TEXT, updated_at::TEXT, last_error, lock_owner, locked_at::TEXT FROM degov_indexer_checkpoint ORDER BY chain_id, dao_code, stream_id) t",
      ),
      queryPostgres(
        databaseUrl,
        "SELECT row_to_json(t) FROM (SELECT id, status, attempts, next_run_at::TEXT, locked_at::TEXT, processed_at::TEXT, error FROM degov_indexer_reconcile_task ORDER BY next_run_at LIMIT 100) t",
      ).catch((error) => [
        {
          id: "degov_indexer_reconcile_task",
          status: "query-error",
          attempts: 0,
          error: error.message,
        },
      ]),
      queryPostgres(
        databaseUrl,
        "SELECT row_to_json(t) FROM (SELECT id, status, attempts, next_run_at::TEXT, locked_at::TEXT, processed_at::TEXT, error FROM onchain_refresh_task ORDER BY next_run_at LIMIT 100) t",
      ).catch((error) => [
        {
          id: "onchain_refresh_task",
          status: "query-error",
          attempts: 0,
          error: error.message,
        },
      ]),
      queryPostgres(
        databaseUrl,
        "SELECT row_to_json(t) FROM (SELECT height::TEXT, hash FROM squid_processor.status LIMIT 1) t",
      ).catch(() => []),
    ]);

  return summarizeStatusTables({
    checkpoints,
    reconcileTasks,
    refreshTasks,
    legacyStatus: legacyStatus[0] ?? null,
  });
}
