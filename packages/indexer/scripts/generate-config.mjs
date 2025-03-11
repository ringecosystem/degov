import * as viemChains from "viem/chains";

function extractEndpoint(degovConfig) {
  const { chain } = degovConfig;

  const chainKeys = Object.keys(viemChains);

  const viemChainName = chainKeys.find((item) => {
    const inputChainId = (chain.id ?? chain.chainId).toString();
    return viemChains[item].id.toString() === inputChainId;
  });
  if (!viemChainName) {
    console.log("unsupported chain");
    process.exit(1);
  }
  const viemChain = viemChains[viemChainName];
  const rpcs = [...(chain.rpcs || [])];

  // console.log(viemChain.rpcUrls);
  if (!rpcs.length) {
    const defaultViemRpc = viemChain.rpcUrls.default;
    rpcs.push(...(defaultViemRpc.ws ?? []));
    rpcs.push(...(defaultViemRpc.webSocket ?? []));
    rpcs.push(...(defaultViemRpc.http ?? []));
  }

  return {
    ...chain,
    rpcs,
  };
}

function extractIndexLog(degovConfig) {
  const { indexer, contracts } = degovConfig;
  const contractNames = Object.keys(contracts);
  const indexContracts = contractNames.map((item) => {
    const c = contracts[item];
    let addr = c.address ? c.address : c;
    return {
      name: item,
      address: addr,
    };
  });
  return {
    startBlock: indexer.startBlock,
    contracts: indexContracts,
  };
}

function extractOthers(degovConfig) {
  const { indexer } = degovConfig;
  return {
    gateway: indexer.gateway,
  }
}

async function writeConfig(indexerConfig) {
  const codes = [];
  const names = Object.keys(indexerConfig);
  for (const name of names) {
    const code = `export const ${name} = ${JSON.stringify(
      indexerConfig[name],
      null,
      2
    )}`;
    codes.push(code);
  }
  const configCode = codes.join("\n\n");
  console.log(configCode);
  await fs.writeFile("src/config.ts", configCode, "utf-8");
}

async function main() {
  const content = await fs.readFile("../../degov.yml", "utf-8");
  const degovConfig = YAML.parse(content);

  const endpoint = extractEndpoint(degovConfig);
  const indexLog = extractIndexLog(degovConfig);
  const others = extractOthers(degovConfig);

  const indexerConfig = {
    endpoint,
    indexLog,
    ...others,
  };
  await writeConfig(indexerConfig);
}

await main();
