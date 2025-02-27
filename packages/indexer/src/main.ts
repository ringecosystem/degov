import { TypeormDatabase } from "@subsquid/typeorm-store";
import { processor } from "./processor";
import {
  IGOVERNOR_CONTRACT_ADDRESS,
  ITOKEN_CONTRACT_ADDRESS,
} from "./constants";
import { GovernorHandler } from "./handler/governor";
import { TokenHandler } from "./handler/token";
import { ProposalCreated } from "./model";

// processor.run(new TypeormDatabase({ supportHotBlocks: true }), async (ctx) => {
//   const burns: Burn[] = [];
//   for (let c of ctx.blocks) {
//     for (let tx of c.transactions) {
//       // decode and normalize the tx data
//       burns.push(
//         new Burn({
//           id: tx.id,
//           block: c.header.height,
//           address: tx.from,
//           value: tx.value,
//           txHash: tx.hash,
//         })
//       );
//     }
//   }
//   // apply vectorized transformations and aggregations
//   const burned = burns.reduce((acc, b) => acc + b.value, 0n) / 1_000_000_000n;
//   const startBlock = ctx.blocks.at(0)?.header.height;
//   const endBlock = ctx.blocks.at(-1)?.header.height;
//   ctx.log.info(`Burned ${burned} Gwei from ${startBlock} to ${endBlock}`);

//   // upsert batches of entities with batch-optimized ctx.store.insert()/upsert()
//   await ctx.store.insert(burns);
// });

let ix = 0;
processor.run(new TypeormDatabase({ supportHotBlocks: true }), async (ctx) => {
  for (const c of ctx.blocks) {
    for (const event of c.logs) {
      if (event.address === IGOVERNOR_CONTRACT_ADDRESS) {
        await new GovernorHandler(ctx).handle(event);
      }
      if (event.address === ITOKEN_CONTRACT_ADDRESS) {
        // await new TokenHandler(ctx).handle(event);
      }
    }
  }
});
