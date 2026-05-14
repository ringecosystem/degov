import { DegovDataSource } from "./datasource";
import { ChainTool } from "./internal/chaintool";
import {
  createOnchainRefreshDataSource,
  processOnchainRefreshBatch,
} from "./onchain-refresh/worker";

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
  const rpcs = resolveRpcs(config.chainId, config.rpcs);

  console.log(
    JSON.stringify({
      msg: "onchain refresh worker started",
      chainId: config.chainId,
      daoCode: work.daoCode,
      governorAddress: governor.address,
      tokenAddress: governorToken.address,
      batchSize,
      multicallChunkSize,
      concurrency,
      maxBatchesPerPoll,
      maxSyncLagBlocks,
      pollIntervalMs,
      rpcCount: rpcs.length,
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
          multicallChunkSize,
          concurrency,
          maxSyncLagBlocks,
        });
        if ("skipped" in result) {
          console.log(JSON.stringify({ msg: "onchain refresh skipped", ...result }));
        } else if (result.claimed > 0) {
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
