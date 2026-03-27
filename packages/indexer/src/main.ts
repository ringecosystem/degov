import { GovernorHandler } from "./handler/governor";
import { TimelockHandler } from "./handler/timelock";
import { TokenHandler } from "./handler/token";
import { EvmBatchProcessor } from "@subsquid/evm-processor";
import { evmFieldSelection, IndexerProcessorConfig } from "./types";
import { DegovDataSource } from "./datasource";
import { ChainTool } from "./internal/chaintool";
import { DegovIndexerHelpers } from "./internal/helpers";
import { TextPlus } from "./internal/textplus";
import { createDatabase } from "./database";

type BatchHandler = GovernorHandler | TokenHandler | TimelockHandler;

function isFlushableHandler(
  handler: BatchHandler,
): handler is BatchHandler & { flush: () => Promise<void> } {
  return "flush" in handler && typeof handler.flush === "function";
}

async function main() {
  const degovConfigPath = process.env.DEGOV_CONFIG_PATH;
  if (!degovConfigPath) {
    throw new Error("DEGOV_CONFIG_PATH not set");
  }
  const config = await DegovDataSource.fromDegovConfigPath(degovConfigPath);
  await runProcessorEvm(config);
}

async function runProcessorEvm(config: IndexerProcessorConfig) {
  const configRpcs = config.rpcs || [];

  const envVarName = `CHAIN_RPC_${config.chainId}`.trim();
  const envRpcsRaw = process.env[envVarName];
  let envRpcs: string[] = [];

  if (envRpcsRaw) {
    envRpcs = envRpcsRaw
      .replace(/\r\n|\n/g, ",")
      .split(",")
      .map((url) => url.trim())
      .filter((url) => url);
  }

  // Prioritize envRpcs if available, otherwise use configRpcs
  let selectedRpcs: string[];
  let rpcSource: string;

  if (envRpcs.length > 0) {
    selectedRpcs = envRpcs;
    rpcSource = "environment variable";
  } else if (configRpcs.length > 0) {
    selectedRpcs = configRpcs;
    rpcSource = "config file";
  } else {
    throw new Error(
      `No RPC endpoints configured. Checked config file and environment variable "${envVarName}".`,
    );
  }

  const pickedIndex = Math.floor(Math.random() * selectedRpcs.length);
  const randomRpcUrl = selectedRpcs[pickedIndex];
  console.log(
    DegovIndexerHelpers.formatLogLine("processor.rpc selected", {
      chainId: config.chainId,
      envVar: envVarName,
      envRpcCount: envRpcs.length,
      configRpcCount: configRpcs.length,
      source: rpcSource,
      selectedIndex: pickedIndex,
      selectedRpc: randomRpcUrl,
    }),
  );

  const processor = new EvmBatchProcessor()
    .setFields(evmFieldSelection)
    .setRpcEndpoint({
      url: randomRpcUrl,
      capacity: config.capacity ?? 30,
      maxBatchCallSize: config.maxBatchCallSize ?? 200,
    });

  if (config.gateway) {
    processor.setGateway(config.gateway);
  }
  processor.setFinalityConfirmation(config.finalityConfirmation ?? 50);

  config.works.forEach((work) => {
    const range = { from: config.startBlock, to: config.endBlock };
    const address = work.contracts.map((item) => item.address);
    processor.addLog({
      range,
      address,
      transaction: true,
    });
    console.log(
      DegovIndexerHelpers.formatLogLine("processor.watch registered", {
        contracts: address,
        fromBlock: range.from,
        toBlock: range.to,
      }),
    );
  });

  const chainTool = new ChainTool();
  const textPlus = new TextPlus();

  processor.run(
    createDatabase(),
    async (ctx) => {
      const batchHandlers = new Map<string, BatchHandler>();
      const batchStartedAt = Date.now();
      const batchStartBlock = ctx.blocks[0]?.header.height;
      const batchEndBlock = ctx.blocks[ctx.blocks.length - 1]?.header.height;
      const heartbeatIntervalMs =
        DegovIndexerHelpers.progressHeartbeatIntervalMs();
      let lastHeartbeatAt = batchStartedAt;
      let blocksSeen = 0;
      let logsSeen = 0;
      let matchedLogsSeen = 0;

      const maybeLogBatchHeartbeat = (fields: {
        currentBlock: number;
        contract?: string;
        tx?: string;
      }) => {
        const now = Date.now();
        if (now - lastHeartbeatAt < heartbeatIntervalMs) {
          return;
        }

        lastHeartbeatAt = now;
        const heartbeatFields: Record<string, string | number> = {
          startBlock: batchStartBlock ?? fields.currentBlock,
          endBlock: batchEndBlock ?? fields.currentBlock,
          currentBlock: fields.currentBlock,
          blocksSeen,
          totalBlocks: ctx.blocks.length,
          logsSeen,
          matchedLogsSeen,
          elapsed: DegovIndexerHelpers.formatDurationMs(now - batchStartedAt),
        };

        if (DegovIndexerHelpers.verboseLoggingEnabled()) {
          heartbeatFields.contract = fields.contract ?? "";
          heartbeatFields.tx = fields.tx ?? "";
        }

        console.log(
          DegovIndexerHelpers.formatLogLine(
            "processor.batch heartbeat",
            heartbeatFields,
          ),
        );
      };

      for (const c of ctx.blocks) {
        blocksSeen += 1;
        maybeLogBatchHeartbeat({
          currentBlock: c.header.height,
        });

        for (const event of c.logs) {
          logsSeen += 1;

          for (const work of config.works) {
            const indexContract = work.contracts.find(
              (item) =>
                item.address.toLowerCase() === event.address.toLowerCase(),
            );

            if (!indexContract) {
              continue;
            }

            try {
              matchedLogsSeen += 1;
              const handlerKey = `${work.daoCode}:${indexContract.name}`;
              maybeLogBatchHeartbeat({
                currentBlock: event.block.height,
                contract: indexContract.name,
                tx: event.transactionHash,
              });

              switch (indexContract.name) {
                case "governor":
                  {
                    let handler = batchHandlers.get(handlerKey);
                    if (!handler) {
                      handler = new GovernorHandler(ctx, {
                        chainId: config.chainId,
                        rpcs: [...new Set([...configRpcs, ...envRpcs])],
                        work,
                        indexContract,
                        chainTool,
                        textPlus,
                      });
                      batchHandlers.set(handlerKey, handler);
                    }
                    await (handler as GovernorHandler).handle(event);
                  }
                  break;
                case "governorToken":
                  {
                    let handler = batchHandlers.get(handlerKey);
                    if (!handler) {
                      handler = new TokenHandler(ctx, {
                        chainId: config.chainId,
                        rpcs: [...new Set([...configRpcs, ...envRpcs])],
                        work,
                        indexContract,
                        chainTool,
                      });
                      batchHandlers.set(handlerKey, handler);
                    }
                    await (handler as TokenHandler).handle(event);
                  }
                  break;
                case "timeLock":
                  {
                    let handler = batchHandlers.get(handlerKey);
                    if (!handler) {
                      handler = new TimelockHandler(ctx, {
                        chainId: config.chainId,
                        rpcs: [...new Set([...configRpcs, ...envRpcs])],
                        work,
                        indexContract,
                        chainTool,
                      });
                      batchHandlers.set(handlerKey, handler);
                    }
                    await (handler as TimelockHandler).handle(event);
                  }
                  break;
              }

              maybeLogBatchHeartbeat({
                currentBlock: event.block.height,
                contract: indexContract.name,
                tx: event.transactionHash,
              });
            } catch (e) {
              ctx.log.warn(
                DegovIndexerHelpers.formatLogLine("processor.event failed", {
                  contract: indexContract.name,
                  block: event.block.height,
                  tx: event.transactionHash,
                  startBlock: ctx.blocks[0].header.height,
                  error: DegovIndexerHelpers.formatError(e),
                }),
              );
              throw e;
            }
          }
        }
      }

      for (const handler of batchHandlers.values()) {
        if (isFlushableHandler(handler)) {
          await handler.flush();
        }
      }
    },
  );
}

main()
  .then(() =>
    console.log(DegovIndexerHelpers.formatLogLine("processor finished")),
  )
  .catch((err) => {
    console.error(
      DegovIndexerHelpers.formatLogLine("processor failed", {
        error: DegovIndexerHelpers.formatError(err),
      }),
    );
    process.exit(1);
  });

process.on("uncaughtException", (error) => {
  console.error(
    DegovIndexerHelpers.formatLogLine("processor uncaught exception", {
      error: DegovIndexerHelpers.formatError(error),
    }),
  );
});
