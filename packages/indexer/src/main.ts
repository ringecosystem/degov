import { TypeormDatabase } from "@subsquid/typeorm-store";
import { GovernorHandler } from "./handler/governor";
import { TokenHandler } from "./handler/token";
import { EvmBatchProcessor } from "@subsquid/evm-processor";
import { evmFieldSelection } from "./types";
import { DegovDataSource, IndexerProcessorConfig } from "./datasource";

async function main() {
  const degovConfigPath = process.env.DEGOV_CONFIG_PATH;
  if (!degovConfigPath) {
    throw new Error("DEGOV_CONFIG_PATH not set");
  }
  const processorConfig = await DegovDataSource.fromDegovConfig(
    degovConfigPath
  );
  await runProcessorEvm(processorConfig);
}

async function runProcessorEvm(processorConfig: IndexerProcessorConfig) {
  const processor = new EvmBatchProcessor()
    .setFields(evmFieldSelection)
    .setRpcEndpoint({
      // More RPC connection options at https://docs.subsquid.io/evm-indexing/configuration/initialization/#set-data-source
      url: processorConfig.rpc,
      capacity: processorConfig.capacity ?? 30,
      maxBatchCallSize: processorConfig.maxBatchCallSize ?? 200,
    });
  if (processorConfig.gateway) {
    processor.setGateway(processorConfig.gateway);
  }
  processor.setFinalityConfirmation(processorConfig.finalityConfirmation ?? 50);
  const logs = processorConfig.logs;
  for (const log of logs) {
    processor.addLog({
      range: { from: log.startBlock, to: log.endBlock },
      address: log.contracts.map((item) => item.address),
      transaction: true,
    });
  }

  processor.run(
    new TypeormDatabase({ supportHotBlocks: true }),
    async (ctx) => {
      for (const c of ctx.blocks) {
        for (const event of c.logs) {
          for (const indexLog of logs) {
            const indexContract = indexLog.contracts.find(
              (item) =>
                item.address.toLowerCase() === event.address.toLowerCase()
            );
            if (!indexContract) {
              continue;
            }

            try {
              switch (indexContract.name) {
                case "governor":
                  await new GovernorHandler(ctx).handle(event);
                  break;
                case "governorToken":
                  await new TokenHandler(ctx, indexContract).handle(event);
                  break;
              }
            } catch (e) {
              ctx.log.warn(
                // indexContract
                `(evm) unhandled contract ${indexContract.name} at ${event.block.height} ${event.transactionHash}, reason: ${e}, stopped from ${ctx.blocks[0].header.height} block`
              );
              throw e;
            }
          }
        }
      }
    }
  );
}

main()
  .then(() => console.log("done"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

process.on("uncaughtException", (error) => {
  console.error(error);
});
