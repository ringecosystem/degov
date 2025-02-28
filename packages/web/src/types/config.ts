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
  chain: string;
  logo: string;
  chainId: number;
  rpc: string[];
  explorer: {
    name: string;
    url: string;
  };
  nativeToken: NativeToken;
}

interface GovernorToken {
  contract: string;
  standard: string;
}

interface Contracts {
  governorContract: string;
  governorToken: GovernorToken;
  timeLockContract: string;
}

interface TokenDetails {
  logo: string;
  chain: string;
  contract: string;
  symbol: string;
  decimals: number;
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
  logo: string;
  daoName: string;
  walletConnectProjectId: string;
  description: string;
  links: Links;
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
  GovernorToken,
  Contracts,
  TokenDetails,
  TimelockAssets,
  Indexer,
};
