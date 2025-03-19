import { TypeormDatabase } from "@subsquid/typeorm-store";
import { processor } from "./processor";
import * as indexConfig from "./config";
import { GovernorHandler } from "./handler/governor";
import { TokenHandler } from "./handler/token";
import { DegovIndexLog } from "./types";

processor.run(new TypeormDatabase({ supportHotBlocks: true }), async (ctx) => {
  const indexLog: DegovIndexLog = indexConfig.indexLog;

  for (const c of ctx.blocks) {
    for (const event of c.logs) {
      const indexContract = indexLog.contracts.find(
        (item) => item.address.toLowerCase() === event.address.toLowerCase()
      );
      if (!indexContract) {
        continue;
      }

      switch (indexContract.name) {
        case "governor":
          await new GovernorHandler(ctx).handle(event);
          break;
        case "governorToken":
          await new TokenHandler(ctx, indexContract).handle(event);
          break;
      }
    }
  }
});
