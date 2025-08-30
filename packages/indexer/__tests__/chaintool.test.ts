import { ChainTool } from "../src/internal/chaintool";

describe("Chain Tool Test", () => {
  const chainTool = new ChainTool();
  // Increased timeout to allow for multiple network requests, especially with RPC fallbacks.
  const TEST_TIMEOUT = 1000 * 60 * 5;

  it(
    "should fetch block intervals and print all results at once",
    async () => {
      const chains = [
        { id: 1, name: "ethereum" },
        { id: 10, name: "op" },
        { id: 46, name: "darwinia", rpcs: ["https://rpc.darwinia.network"] },
        { id: 56, name: "bsc" },
        { id: 100, name: "gnosis" },
        { id: 137, name: "polygon" },
        { id: 2710, name: "morph" },
        { id: 5000, name: "mantle" },
        { id: 8453, name: "base" },
        { id: 42161, name: "arbitrum" },
        { id: 43114, name: "avalanche-c" },
        { id: 59144, name: "linea" },
        { id: 81457, name: "blast" },
        { id: 534352, name: "scroll" },
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
            // Return a consistent success object
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
            // Return a consistent failure object
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
        // The promise itself will always be 'fulfilled' because we are catching errors inside the map.
        if (result.status === "fulfilled") {
          const outcome = result.value;
          // We check our custom status property to see if the operation succeeded.
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

  it(
    "check quorum",
    async () => {
      const daos = [
        {
          dao: "ens-dao",
          chain: 1,
          contracts: {
            governor: "0x323A76393544d5ecca80cd6ef2A560C6a395b7E3",
            governorToken: {
              address: "0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72",
              standard: "ERC20",
            },
          },
        },
        {
          dao: "aquari-dao",
          chain: 8453,
          contracts: {
            governor: "0x062f87ae9eCAd31398C0cF5Ef269feb9050b9DF6",
            governorToken: {
              address: "0x23c2e12caaE858f1cc7a4B3d1499C6881C86839b",
              standard: "ERC20",
            },
          },
        },
        {
          dao: "ring-dao",
          chain: 46,
          contracts: {
            governor: "0x52cDD25f7C83c335236Ce209fA1ec8e197E96533",
            governorToken: {
              address: "0xdafa555e2785DC8834F4Ea9D1ED88B6049142999",
              standard: "ERC20",
            },
          },
        },
        {
          dao: "ring-dao-guild",
          chain: 46,
          contracts: {
            governor: "0x234179ae929D886fceA83a6D04af69A86134AA3B",
            governorToken: {
              address: "0x21D4A3c5390D098073598d30FD49d32F9d9E355E",
              standard: "ERC721",
            },
          },
        },
        {
          dao: "unlock-dao",
          chain: 8453,
          contracts: {
            governor: "0x65bA0624403Fc5Ca2b20479e9F626eD4D78E0aD9",
            governorToken: {
              address: "0xaC27fa800955849d6D17cC8952Ba9dD6EAA66187",
              standard: "ERC20",
            },
          },
        },
        {
          dao: "hai-dao",
          chain: 10,
          contracts: {
            governor: "0xe807f3282f3391d237BA8B9bECb0d8Ea3ba23777",
            governorToken: {
              address: "0xf467C7d5a4A9C4687fFc7986aC6aD5A4c81E1404",
              standard: "ERC20",
            },
          },
        },
        {
          dao: "gmx-dao",
          chain: 42161,
          contracts: {
            governor: "0x03e8f708e9C85EDCEaa6AD7Cd06824CeB82A7E68",
            governorToken: {
              address: "0x2A29D3a792000750807cc401806d6fd539928481",
              standard: "ERC20",
            },
          },
        },
      ];

      console.log("\nStarting to fetch quorum for all DAOs...\n");

      const results = await Promise.allSettled(
        daos.map(async (dao) => {
          try {
            const result = await chainTool.quorum({
              chainId: dao.chain,
              contractAddress: dao.contracts.governor as `0x${string}`,
              governorTokenAddress: dao.contracts.governorToken
                .address as `0x${string}`,
              standard: dao.contracts.governorToken.standard as
                | "ERC20"
                | "ERC721",
            });
            return {
              name: dao.dao,
              status: "fulfilled" as const,
              value: result,
            };
          } catch (error) {
            const errorMessage =
              error instanceof Error
                ? error.message
                : "An unknown error occurred";
            return {
              name: dao.dao,
              status: "rejected" as const,
              reason: errorMessage,
            };
          }
        })
      );

      const outputLines: string[] = [];
      outputLines.push("--- Quorum Results ---");

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          const outcome = result.value;
          if (outcome.status === "fulfilled") {
            const { clockMode, quorum, decimals } = outcome.value;
            const quorumFormatted =
              decimals && decimals > 1n
                ? (Number(quorum) / 10 ** Number(decimals)).toLocaleString()
                : quorum.toString();
            const line = `✅ ${outcome.name.padEnd(
              15
            )}: Quorum: ${quorumFormatted.padEnd(
              20
            )} | ClockMode: ${clockMode.padEnd(12)} | Decimals: ${
              decimals ?? "N/A"
            }`;
            outputLines.push(line);
          } else {
            const line = `❌ ${outcome.name.padEnd(15)}: Failed (${
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
