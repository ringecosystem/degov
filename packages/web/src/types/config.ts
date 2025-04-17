import type { Chain as ViemChain } from "viem";
interface Links {
  website?: string;
  twitter?: string;
  discord?: string;
  telegram?: string;
  github?: string;
  email?: string | null;
}

interface NativeToken {
  symbol: string;
  decimals: number;
  priceId: string;
  logo?: string | null;
}

interface Chain {
  name: string;
  rpcs: string[];
  explorers: string[];
  nativeToken: NativeToken;
  id: number;
  logo: string;
  contracts?: ViemChain["contracts"];
}

interface Wallet {
  walletConnectProjectId: string;
}

interface GovernorToken {
  address: string;
  standard: string;
}

interface Contracts {
  governor: string;
  governorToken: GovernorToken;
  timeLock: string;
}

interface TokenDetails {
  name: string;
  contract: string;
  standard: string;
  priceId?: string;
  logo: string | null;
}

type TimelockAssets = TokenDetails[];

interface Indexer {
  endpoint: string;
  startBlock: number;
}

interface SafeItem {
  name: string;
  chainId: number;
  link: string;
}

type SafeConfig = SafeItem[];

interface Config {
  name: string;
  logo: string;
  description: string;
  links: Links;
  wallet: Wallet;
  chain: Chain;
  contracts: Contracts;
  timeLockAssets: TimelockAssets;
  indexer: Indexer;
  safes?: SafeConfig;
}

export type {
  Config,
  Links,
  NativeToken,
  Chain,
  Wallet,
  GovernorToken,
  Contracts,
  TokenDetails,
  TimelockAssets,
  Indexer,
  SafeItem,
  SafeConfig,
};
