import * as viemChains from "viem/chains";

function extendChainConfig(degovConfig) {
  const { chain } = degovConfig;

  const stdViemChain = {};
  const chainKeys = Object.keys(viemChains);

  const viemChainName = chainKeys.find((item) => {
    const inputChainId = (chain.id ?? chain.chainId).toString();
    return viemChains[item].id.toString() === inputChainId;
  });

  if (viemChainName) {
    const viemChain = viemChains[viemChainName];
    stdViemChain.name = viemChain.name;

    const defaultViemRpc = viemChain.rpcUrls.default;
    stdViemChain.rpcs = defaultViemRpc.http ?? [];
    const defualtViemExplorer = viemChain.blockExplorers.default;
    stdViemChain.explorers = [defualtViemExplorer.url];
    stdViemChain.contracts = viemChain.contracts;
    const nativeCurrency = viemChain.nativeCurrency;
    stdViemChain.nativeToken = {
      symbol: nativeCurrency.symbol,
      decimals: nativeCurrency.decimals,
    };

    stdViemChain.id = viemChain.id;
  }
  const stdChain = { ...stdViemChain, ...chain };
  if (stdChain.nativeToken) {
    if (!stdChain.nativeToken.symbol) {
      stdChain.nativeToken.symbol = stdViemChain.nativeToken.symbol;
      stdChain.nativeToken.decimals = stdViemChain.nativeToken.decimals;
    }
  }
  degovConfig.chain = stdChain;
}

async function writeConfig(degovConfig) {
  const configCode = YAML.stringify(degovConfig);
  await fs.writeFile("public/config.yml", configCode, "utf-8");
}

async function main() {
  const degovConfigPath = $.env["DEGOV_CONFIG_PATH"] ?? "../../degov.yml";

  const content = await fs.readFile(degovConfigPath, "utf-8");
  const degovConfig = YAML.parse(content);

  extendChainConfig(degovConfig);

  await writeConfig(degovConfig);
}

await main();
