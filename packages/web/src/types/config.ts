import type { Chain as ViemChain } from "viem";
interface Links {
  website?: string;
  twitter?: string;
  discord?: string;
  telegram?: string;
  github?: string;
  email?: string | null;
}

interface Theme {
  logoDark?: string;
  logoLight?: string;
  banner?: string;
  bannerMobile?: string;
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
  timeLock?: string;
}

interface TokenDetails {
  name: string;
  contract: string;
  standard: string;
  priceId?: string;
  logo: string | null;
}

type TreasuryAssets = TokenDetails[];

interface Indexer {
  endpoint: string;
  startBlock: number;
}

interface SafeItem {
  name: string;
  chainId: number;
  link: string;
}

interface AiAgent {
  endpoint?: string;
}

interface AppItem {
  name: string;
  description: string;
  icon: string;
  link: string;
}

type SafeConfig = SafeItem[];
type AppConfig = AppItem[];

interface Config {
  name: string;
  code: string;
  logo: string;
  siteUrl: string;
  offChainDiscussionUrl?: string;
  description: string;
  links: Links;
  theme?: Theme;
  wallet: Wallet;
  chain: Chain;
  contracts: Contracts;
  treasuryAssets: TreasuryAssets;
  indexer: Indexer;
  safes?: SafeConfig;
  apps?: AppConfig;
  aiAgent?: AiAgent;
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
  TreasuryAssets,
  Indexer,
  SafeItem,
  SafeConfig,
  AppItem,
  AppConfig,
};
