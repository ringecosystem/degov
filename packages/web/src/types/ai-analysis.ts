export interface PollOption {
  label: string;
  votes: number;
  position: number;
}

export interface VotingBreakdown {
  twitterPoll: {
    for: number;
    against: number;
    abstain: number;
  };
  twitterComments: {
    positive: number;
    negative: number;
    neutral: number;
  };
  onChainVotes: {
    for: number;
    against: number;
    abstain: number;
  };
}

export interface AnalysisOutput {
  finalResult: string;
  confidence: number;
  reasoning: string;
  reasoningLite: string;
  votingBreakdown: VotingBreakdown;
}

export interface AnalysisInput {
  pollOptions: PollOption[];
}

export interface FulfilledExplain {
  input: AnalysisInput;
  output: AnalysisOutput;
}

export interface ChainConfig {
  name: string;
  rpcs: string[];
  explorers: string[];
  contracts: {
    multicall3: {
      address: string;
      blockCreated: number;
    };
  };
  nativeToken: {
    priceId: string;
    symbol: string;
    decimals: number;
  };
  id: number;
  logo: string;
}

export interface ContractsConfig {
  governor: string;
  governorToken: {
    address: string;
    standard: string;
  };
  timeLock: string;
}

export interface TimeLockAsset {
  name: string;
  contract: string;
  standard: string;
  priceId: string;
}

export interface Safe {
  name: string;
  chainId: number;
  link: string;
}

export interface IndexerConfig {
  endpoint: string;
  startBlock: number;
  rpc: string;
}

export interface LinksConfig {
  website: string;
  twitter: string;
  discord: string;
  telegram: string;
  github: string;
}

export interface WalletConfig {
  walletConnectProjectId: string;
}

export interface DaoConfigData {
  name: string;
  logo: string;
  siteUrl: string;
  offChainDiscussionUrl: string;
  description: string;
  links: LinksConfig;
  wallet: WalletConfig;
  chain: ChainConfig;
  indexer: IndexerConfig;
  contracts: ContractsConfig;
  timeLockAssets: TimeLockAsset[];
  safes: Safe[];
}

export interface DaoInfo {
  name: string;
  code: string;
  xprofile: string;
  links: {
    website: string;
    config: string;
    indexer: string;
  };
  config: DaoConfigData;
  lastProcessedBlock: number;
}

export interface TwitterUser {
  id: string;
  name: string;
  username: string;
  verified: boolean;
}

export interface AiAnalysisData {
  id: string;
  daocode: string;
  proposal_id: string;
  chain_id: number;
  status: string;
  errored: number;
  fulfilled: number;
  type: string;
  sync_stop_tweet: number;
  sync_stop_reply: number;
  sync_next_time_tweet: string;
  times_processed: number;
  message: string;
  fulfilled_explain: FulfilledExplain;
  ctime: string;
  utime: string;
  dao: DaoInfo;
  twitter_user: TwitterUser;
}

export interface AiAnalysisResponse {
  code: number;
  data: AiAnalysisData;
}
