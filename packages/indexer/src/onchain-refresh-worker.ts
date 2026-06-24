import { DegovDataSource } from "./datasource";
import { parseIndexerPowerSource } from "./handler/token";
import { ChainTool } from "./internal/chaintool";
import {
  createOnchainRefreshCheckpointDataSource,
  createOnchainRefreshDataSource,
  processOnchainRefreshBatch,
} from "./onchain-refresh/worker";
import { parseOnchainEventReadsEnabled } from "./onchain-refresh/task";

async function main() {
  const degovConfigPath = process.env.DEGOV_CONFIG_PATH;
  if (!degovConfigPath) {
    throw new Error("DEGOV_CONFIG_PATH not set");
  }
  if (process.env.DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED === "false") {
    console.log("onchain refresh worker disabled");
    return;
  }

  const config = await DegovDataSource.fromDegovConfigPath(degovConfigPath);
  const work = config.works[0];
  const governor = work.contracts.find((item) => item.name === "governor");
  const governorToken = work.contracts.find(
    (item) => item.name === "governorToken",
  );
  if (!governor || !governorToken) {
    throw new Error("Governor and governorToken must exist in the selected config");
  }

  const dataSource = await createOnchainRefreshDataSource();
  const checkpointDataSource = await createOnchainRefreshCheckpointDataSource();
  const chainTool = new ChainTool();
  const workerId = [
    "onchain-refresh",
    process.env.HOSTNAME ?? process.pid.toString(),
  ].join("-");
  const pollIntervalMs = readIntegerEnv(
    "DEGOV_ONCHAIN_REFRESH_POLL_INTERVAL_MS",
    10_000,
  );
  const batchSize = readIntegerEnv("DEGOV_ONCHAIN_REFRESH_BATCH_SIZE", 100);
  const reconcileSeedBatchSize = readIntegerEnv(
    "DEGOV_ONCHAIN_REFRESH_RECONCILE_SEED_BATCH_SIZE",
    batchSize,
  );
  const multicallChunkSize = readIntegerEnv(
    "DEGOV_ONCHAIN_REFRESH_MULTICALL_CHUNK_SIZE",
    100,
  );
  const concurrency = readIntegerEnv("DEGOV_ONCHAIN_REFRESH_CONCURRENCY", 1);
  const maxBatchesPerPoll = readIntegerEnv(
    "DEGOV_ONCHAIN_REFRESH_MAX_BATCHES_PER_POLL",
    1,
  );
  const maxSyncLagBlocks = readIntegerEnv(
    "DEGOV_ONCHAIN_REFRESH_MAX_SYNC_LAG_BLOCKS",
    1_000,
  );
  const lockTtlMs = readIntegerEnv("DEGOV_ONCHAIN_REFRESH_LOCK_TTL_MS", 300_000);
  const checkpointContractSetId = readStringEnv(
    "DEGOV_ONCHAIN_REFRESH_CHECKPOINT_CONTRACT_SET_ID",
  );
  const checkpointStreamId = readStringEnv(
    "DEGOV_ONCHAIN_REFRESH_CHECKPOINT_STREAM_ID",
  );
  const checkpointDataSourceVersion = readStringEnv(
    "DEGOV_ONCHAIN_REFRESH_CHECKPOINT_DATA_SOURCE_VERSION",
  );
  const seedReconcile =
    parseIndexerPowerSource() === "onchain" &&
    !parseOnchainEventReadsEnabled();
  const rpcs = resolveRpcs(config.chainId, config.rpcs);
  let reconcileSeedStartAfterAccount: string | undefined;

  console.log(
    JSON.stringify({
      msg: "onchain refresh worker started",
      chainId: config.chainId,
      daoCode: work.daoCode,
      governorAddress: governor.address,
      tokenAddress: governorToken.address,
      batchSize,
      reconcileSeedBatchSize,
      multicallChunkSize,
      concurrency,
      maxBatchesPerPoll,
      maxSyncLagBlocks,
      lockTtlMs,
      seedReconcile,
      pollIntervalMs,
      rpcCount: rpcs.length,
      checkpointDatabaseConfigured: Boolean(checkpointDataSource),
      checkpointContractSetId,
      checkpointStreamId,
      checkpointDataSourceVersion,
    }),
  );

  while (true) {
    try {
      for (let index = 0; index < maxBatchesPerPoll; index += 1) {
        const result = await processOnchainRefreshBatch(dataSource, chainTool, {
          chainId: config.chainId,
          daoCode: work.daoCode,
          governorAddress: governor.address,
          tokenAddress: governorToken.address,
          rpcs,
          multicallAddress: config.multicallAddress,
          workerId,
          batchSize,
          reconcileSeedBatchSize,
          multicallChunkSize,
          concurrency,
          maxSyncLagBlocks,
          checkpointDataSource,
          checkpointContractSetId,
          checkpointStreamId,
          checkpointDataSourceVersion,
          lockTtlMs,
          seedReconcile,
          reconcileSeedStartAfterAccount,
        });
        if ("accountsScanned" in result) {
          reconcileSeedStartAfterAccount = result.seedLimitReached
            ? result.nextStartAfterAccount
            : undefined;
        }
        if ("skipped" in result) {
          console.log(JSON.stringify({ msg: "onchain refresh skipped", ...result }));
        } else if (result.claimed > 0 || "accountsScanned" in result) {
          console.log(JSON.stringify({ msg: "onchain refresh batch", ...result }));
        }
        if (result.claimed < batchSize) {
          break;
        }
      }
    } catch (error) {
      console.error("onchain refresh worker batch failed", error);
    }
    await sleep(pollIntervalMs);
  }
}

function resolveRpcs(chainId: number, configRpcs: string[]) {
  const raw = process.env[`CHAIN_RPC_${chainId}`];
  const envRpcs = raw
    ? raw
        .replace(/\r\n|\n/g, ",")
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean)
    : [];
  return [...new Set([...envRpcs, ...configRpcs])];
}

function readIntegerEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer. Received: ${value}`);
  }
  return parsed;
}

function readStringEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
