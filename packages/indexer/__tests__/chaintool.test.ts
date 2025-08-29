import { ChainTool } from "../src/internal/chaintool";

describe("Chain Tool Test", () => {
  const chainTool = new ChainTool();
  const TEST_TIMEOUT = 1000 * 60 * 3;

  it(
    "should fetch block intervals and print all results at once",
    async () => {
      const chains = [
        {
          id: 1,
          name: "ethereum",
          rpcs: [
            "https://eth-mainnet.public.blastapi.io",
            "https://ethereum-rpc.publicnode.com",
          ],
        },
        {
          id: 10,
          name: "op",
          rpcs: [
            "https://mainnet.optimism.io",
            "https://optimism-rpc.publicnode.com",
            "https://optimism.drpc.org",
          ],
        },
        { id: 46, name: "darwinia", rpcs: ["https://rpc.darwinia.network"] },
        {
          id: 56,
          name: "bsc",
          rpcs: [
            "https://bsc-dataseed1.binance.org",
            "https://bsc-rpc.publicnode.com",
            "https://bsc.therpc.io",
          ],
        },
        {
          id: 100,
          name: "gnosis",
          rpcs: [
            "https://rpc.gnosischain.com",
            "https://0xrpc.io/gno",
            "https://gnosis-mainnet.public.blastapi.io",
          ],
        },
        {
          id: 137,
          name: "polygon",
          rpcs: [
            "https://polygon-rpc.com",
            "https://polygon-public.nodies.app",
          ],
        },
        { id: 2710, name: "morph", rpcs: ["https://rpc.morphl2.io"] },
        { id: 5000, name: "mantle", rpcs: ["https://rpc.mantle.xyz"] },
        { id: 8453, name: "base", rpcs: ["https://mainnet.base.org"] },
        {
          id: 42161,
          name: "arbitrum",
          rpcs: [
            "https://arb1.arbitrum.io/rpc",
            "https://arbitrum-one-rpc.publicnode.com",
            "https://arbitrum-one.public.blastapi.io",
            "https://arbitrum.drpc.org",
            "https://arb1.lava.build",
            "https://rpc.poolz.finance/arbitrum",
            "https://arbitrum.rpc.subquery.network/public",
          ],
        },
        {
          id: 43114,
          name: "avalanche-c",
          rpcs: ["https://api.avax.network/ext/bc/C/rpc"],
        },
        { id: 59144, name: "linea", rpcs: ["https://rpc.linea.build"] },
        { id: 81457, name: "blast", rpcs: ["https://rpc.blast.io"] },
        { id: 534352, name: "scroll", rpcs: ["https://rpc.scroll.io"] },
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
