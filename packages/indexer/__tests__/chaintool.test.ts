import { ChainTool } from "../src/internal/chaintool";

describe("Chain Tool Test", () => {
  const chainTool = new ChainTool();
  const TEST_TIMEOUT = 1000 * 60 * 3;

  it(
    "should fetch block intervals and print all results at once",
    async () => {
      const chains = [
        { id: 1, name: "ethereum", rpcs: [] },
        { id: 10, name: "op", rpcs: [] },
        { id: 46, name: "darwinia", rpcs: [] },
        { id: 56, name: "bsc", rpcs: [] },
        { id: 100, name: "gnosis", rpcs: [] },
        { id: 137, name: "polygon", rpcs: [] },
        { id: 2710, name: "morph", rpcs: [] },
        { id: 5000, name: "mantle", rpcs: [] },
        { id: 8453, name: "base", rpcs: [] },
        { id: 42161, name: "arbitrum", rpcs: [] },
        { id: 43114, name: "avalanche-c", rpcs: [] },
        { id: 59144, name: "linea", rpcs: [] },
        { id: 81457, name: "blast", rpcs: [] },
        { id: 534352, name: "scroll", rpcs: [] },
      ];

      console.log("Starting to fetch block intervals for all chains...\n");

      const results = await Promise.allSettled(
        chains.map(async (chain) => {
          try {
            const interval = await chainTool.blockIntervalSeconds({
              chainId: chain.id,
              rpcs: chain.rpcs,
              enableFloatValue: true,
            });
            return {
              name: chain.name,
              status: "fulfilled" as const,
              value: interval,
            };
          } catch (error) {
            const errorMessage =
              error instanceof Error
                ? error.message
                : "An unknown error occurred";
            return {
              name: chain.name,
              status: "rejected" as const,
              reason: errorMessage,
            };
          }
        })
      );

      const outputLines: string[] = [];
      outputLines.push("--- Block Interval Results ---");

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          const outcome = result.value;
          if (outcome.status === "fulfilled") {
            const line = `✅ ${outcome.name.padEnd(
              12
            )}: ${outcome.value.toFixed(2)} seconds`;
            outputLines.push(line);
          } else {
            const line = `❌ ${outcome.name.padEnd(12)}: Failed (${
              outcome.reason
            })`;
            outputLines.push(line);
          }
        }
      });

      outputLines.push("\n--- Test Complete ---");

      console.log(outputLines.join("\n"));
    },
    TEST_TIMEOUT
  );
});
