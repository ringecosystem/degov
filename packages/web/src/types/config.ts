interface Links {
  website?: string;
  twitter?: string;
  discord?: string;
  telegram?: string;
  github?: string;
  email?: string;
}

interface NativeToken {
  symbol: string;
  decimals: number;
  priceId: string;
}

interface NetworkInfo {
  logo: string;
  chainId: number;
  rpc: string[];
  explorer: string[];
  nativeToken: NativeToken;
  name?: string;
}

interface Networks {
  [chainName: string]: NetworkInfo;
}

interface GovernorToken {
  contract: string;
  standard: string;
}

interface Contracts {
  governor: string;
  governorToken: GovernorToken;
  timeLock: string;
}

interface TokenDetails {
  logo: string;
  chain: string;
  contract: string;
  standard: string;
  priceId?: string;
}

interface TimelockAssets {
  [key: string]: TokenDetails;
}

interface Indexer {
  endpoint: string;
}

interface Config {
  name: string;
  logo: string;
  deployedChain: string;
  walletConnectProjectId: string;
  description: string;
  links: Links;
  networks: Networks;
  network: NetworkInfo;
  contracts: Contracts;
  timeLockAssets: TimelockAssets;
  indexer: Indexer;
}

export type {
  Config,
  Links,
  NativeToken,
  NetworkInfo,
  Networks,
  GovernorToken,
  Contracts,
  TokenDetails,
  TimelockAssets,
  Indexer,
};
