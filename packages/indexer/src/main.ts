import { TypeormDatabase } from "@subsquid/typeorm-store";
import { GovernorHandler } from "./handler/governor";
import { TokenHandler } from "./handler/token";
import { EvmBatchProcessor } from "@subsquid/evm-processor";
import { evmFieldSelection, IndexerProcessorConfig } from "./types";
import { DegovDataSource } from "./datasource";
import { ChainTool } from "./internal/chaintool";
import { TextPlus } from "./internal/textplus";

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
  console.log(`ENV RPCS Raw: ${envRpcsRaw} of key [${envVarName}]`);

  if (envRpcsRaw) {
    envRpcs = envRpcsRaw
      .replace(/\r\n|\n/g, ",")
      .split(",")
      .map((url) => url.trim())
      .filter((url) => url);
  }

  const allRpcs = [...new Set([...configRpcs, ...envRpcs])];

  if (allRpcs.length === 0) {
    throw new Error(
      `No RPC endpoints configured. Checked config file and environment variable "${envVarName}".`
    );
  }

  const pickedIndex = Math.floor(Math.random() * allRpcs.length);
  const randomRpcUrl = allRpcs[pickedIndex];
  console.log("Loaded ENV RPC endpoints:");
  envRpcs.forEach((url, index) => {
    console.log(` - [${index}] ${url}`);
  });
  console.log("Loaded Config RPC endpoints:");
  configRpcs.forEach((url, index) => {
    console.log(` - [${index}] ${url}`);
  });
  console.log(
    `Using RPC endpoint: ${randomRpcUrl} picked index ${pickedIndex} from ${allRpcs.length}`
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
      `Add log watch for ${address.join(", ")} for range ${JSON.stringify(
        range
      )}`
    );
  });

  const chainTool = new ChainTool();
  const textPlus = new TextPlus();

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
                    rpcs: allRpcs,
                    work,
                    indexContract,
                    chainTool,
                    textPlus,
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
