import { TypeormDatabase } from "@subsquid/typeorm-store";
import { GovernorHandler } from "./handler/governor";
import { TokenHandler } from "./handler/token";
import { EvmBatchProcessor } from "@subsquid/evm-processor";
import { evmFieldSelection, IndexerProcessorConfig } from "./types";
import { DegovDataSource } from "./datasource";
import { ChainTool } from "./internal/chaintool";

async function main() {
  const degovConfigPath = process.env.DEGOV_CONFIG_PATH;
  if (!degovConfigPath) {
    throw new Error("DEGOV_CONFIG_PATH not set");
  }
  const config = await DegovDataSource.fromDegovConfigPath(degovConfigPath);
  await runProcessorEvm(config);
}

async function runProcessorEvm(config: IndexerProcessorConfig) {
  if (!config.rpcs.length) {
    throw new Error("no RPC endpoints configured");
  }
  const processor = new EvmBatchProcessor()
    .setFields(evmFieldSelection)
    .setRpcEndpoint({
      // More RPC connection options at https://docs.subsquid.io/evm-indexing/configuration/initialization/#set-data-source
      url: config.rpcs[0],
      capacity: config.capacity ?? 30,
      maxBatchCallSize: config.maxBatchCallSize ?? 200,
    });
  if (config.gateway) {
    processor.setGateway(config.gateway);
  }
  processor.setFinalityConfirmation(config.finalityConfirmation ?? 50);

  config.works.forEach((work) => {
    processor.addLog({
      range: { from: config.startBlock, to: config.endBlock },
      address: work.contracts.map((item) => item.address),
      transaction: true,
    });
  });

  const chainTool = new ChainTool();

  processor.run(
    new TypeormDatabase({ supportHotBlocks: true }),
    async (ctx) => {
      for (const c of ctx.blocks) {
        for (const event of c.logs) {
          for (const work of config.works) {
            const indexContract = work.contracts.find(
              (item) =>
                item.address.toLowerCase() === event.address.toLowerCase()
            );

            if (!indexContract) {
              continue;
            }

            try {
              switch (indexContract.name) {
                case "governor":
                  await new GovernorHandler(ctx, {
                    chainId: config.chainId,
                    rpcs: config.rpcs,
                    work,
                    indexContract,
                    chainTool,
                  }).handle(event);
                  break;
                case "governorToken":
                  await new TokenHandler(ctx, {
                    chainId: config.chainId,
                    work,
                    indexContract,
                  }).handle(event);
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
