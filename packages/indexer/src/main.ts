import { TypeormDatabase } from "@subsquid/typeorm-store";
import { DegovConfig, DegovConfigIndexLog, DegovConfigNanny } from "./config";
import { GovernorHandler } from "./handler/governor";
import { TokenHandler } from "./handler/token";
import { EvmBatchProcessor } from "@subsquid/evm-processor";
import { evmFieldSelection } from "./types";

async function main() {
  const nanny = new DegovConfigNanny();
  const config = await nanny.load();
  await runProcessorEvm(config);
}

async function runProcessorEvm(config: DegovConfig) {
  const processor = new EvmBatchProcessor()
    .setRpcEndpoint({
      // More RPC connection options at https://docs.subsquid.io/evm-indexing/configuration/initialization/#set-data-source
      capacity: 30,
      maxBatchCallSize: 200,
      url: config.endpoint.rpcs[0],
    })
    .setFields(evmFieldSelection);
  // .setFinalityConfirmation(ormpContract.finalityConfirmation ?? 50);
  if (config.gateway) {
    processor.setGateway(config.gateway);
  }

  const indexLog: DegovConfigIndexLog = config.indexLog;

  processor.run(
    new TypeormDatabase({ supportHotBlocks: true }),
    async (ctx) => {
      for (const c of ctx.blocks) {
        for (const event of c.logs) {
          const indexContract = indexLog.contracts.find(
            (item) => item.address.toLowerCase() === event.address.toLowerCase()
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
          } finally {
            ctx.log.warn(
              `unhandled contract ${indexContract.name} at ${event.block.height} ${event.transactionHash}`
            );
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
