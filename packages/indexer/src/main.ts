import { TypeormDatabase } from "@subsquid/typeorm-store";
import { processor } from "./processor";
import { DegovConfig, DegovConfigIndexLog, DegovConfigNanny } from "./config";
import { GovernorHandler } from "./handler/governor";
import { TokenHandler } from "./handler/token";

async function main() {
  const nanny = new DegovConfigNanny();
  const config = await nanny.load();
  processIndex(config);
}

function processIndex(config: DegovConfig) {
  if (!config.code) {
    throw new Error("config.code is required");
  }
  const indexLog: DegovConfigIndexLog = config.indexLog;
  processor
    .setRpcEndpoint({
      // More RPC connection options at https://docs.subsquid.io/evm-indexing/configuration/initialization/#set-data-source
      capacity: 30,
      maxBatchCallSize: 200,
      url: config.endpoint.rpcs[0],
    })
    .setFinalityConfirmation(10)
    .addLog({
      range: { from: indexLog.startBlock },
      address: indexLog.contracts.map((item) => item.address),
    });
  if (config.gateway) {
    processor.setGateway(config.gateway);
  }

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
                await new TokenHandler(ctx, indexContract, config).handle(event);
                break;
            }
          } catch (e) {
            ctx.log.warn(
              `(evm) unhandled contract ${indexContract.name} at ${event.block.height} ${event.transactionHash}, reason: ${e}, stopped from ${ctx.blocks[0].header.height} block`
            );
            throw e;
          }
        }
      }
    }
  );
}

main().then(() => console.log("done"));
