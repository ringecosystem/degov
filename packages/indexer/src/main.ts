import { TypeormDatabase } from "@subsquid/typeorm-store";
import { processor } from "./processor";
import {
  IGOVERNOR_CONTRACT_ADDRESS,
  ITOKEN_CONTRACT_ADDRESS,
} from "./constants";
import { GovernorHandler } from "./handler/governor";
import { TokenHandler } from "./handler/token";

processor.run(new TypeormDatabase({ supportHotBlocks: true }), async (ctx) => {
  for (const c of ctx.blocks) {
    for (const event of c.logs) {
      if (event.address === IGOVERNOR_CONTRACT_ADDRESS) {
        await new GovernorHandler(ctx).handle(event);
      }
      if (event.address === ITOKEN_CONTRACT_ADDRESS) {
        await new TokenHandler(ctx).handle(event);
      }
    }
  }
});
