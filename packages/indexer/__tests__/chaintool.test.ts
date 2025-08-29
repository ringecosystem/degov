import { ChainTool } from "../src/internal/chaintool";

describe("Chain Tool Test", () => {
  const chainTool = new ChainTool();
  const TEST_TIMEOUT = 1000 * 60 * 3;

  it(
    "should fetch block intervals and print all results at once",
    async () => {
      const chains = [
        { id: 1, name: "ethereum", endpoint: "https://eth-mainnet.public.blastapi.io" },
        { id: 10, name: "op", endpoint: "https://mainnet.optimism.io" },
        { id: 46, name: "darwinia", endpoint: "https://rpc.darwinia.network" },
        { id: 56, name: "bsc", endpoint: "https://bsc-dataseed1.binance.org" },
        { id: 100, name: "gnosis", endpoint: "https://rpc.gnosischain.com" },
        { id: 137, name: "polygon", endpoint: "https://polygon-rpc.com" },
        { id: 2710, name: "morph", endpoint: "https://rpc.morphl2.io" },
        { id: 5000, name: "mantle", endpoint: "https://rpc.mantle.xyz" },
        { id: 8453, name: "base", endpoint: "https://mainnet.base.org" },
        {
          id: 42161,
          name: "arbitrum",
          endpoint: "https://arb1.arbitrum.io/rpc",
        },
        {
          id: 43114,
          name: "avalanche-c",
          endpoint: "https://api.avax.network/ext/bc/C/rpc",
        },
        { id: 59144, name: "linea", endpoint: "https://rpc.linea.build" },
        { id: 81457, name: "blast", endpoint: "https://rpc.blast.io" },
        { id: 534352, name: "scroll", endpoint: "https://rpc.scroll.io" },
      ];

      console.log("Starting to fetch block intervals for all chains...\n");

      const results = await Promise.allSettled(
        chains.map(async (chain) => {
          try {
            const interval = await chainTool.blockIntervalSeconds({
              chainId: chain.id,
              endpoint: chain.endpoint,
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
