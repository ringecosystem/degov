import { TypeormDatabase } from "@subsquid/typeorm-store";
import { processor } from "./processor";
import * as indexConfig from "./config";
import { GovernorHandler } from "./handler/governor";
import { TokenHandler } from "./handler/token";

processor.run(new TypeormDatabase({ supportHotBlocks: true }), async (ctx) => {
  const indexLog = indexConfig.indexLog;

  for (const c of ctx.blocks) {
    for (const event of c.logs) {
      const il = indexLog.contracts.find(
        (item) => item.address.toLowerCase() === event.address.toLowerCase()
      );
      if (!il) {
        continue;
      }

      switch (il.name) {
        case "governor":
          await new GovernorHandler(ctx).handle(event);
          break;
        case "governorToken":
          await new TokenHandler(ctx).handle(event);
          break;
      }
    }
  }
});
