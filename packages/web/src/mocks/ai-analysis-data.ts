import type { AiAnalysisData } from "@/types/ai-analysis";

export const mockAiAnalysisData: AiAnalysisData = {
  id: "1935946765317832887",
  daocode: "degov-test-dao",
  proposal_id:
    "0xd405fa55165a239bc26d7324dee1a30e9baa5fc257ac16233ba20cd204a56909",
  chain_id: 46,
  status: "defeated",
  errored: 0,
  fulfilled: 1,
  type: "poll",
  sync_stop_tweet: 0,
  sync_stop_reply: 0,
  sync_next_time_tweet: "2025-06-20T06:26:11.000Z",
  times_processed: 1,
  message:
    "[1] Error processing tweet 1935946765317832887: [task-fulfill] No poll found for tweet 1935946765317832887, cannot fulfill tweet poll.",
  fulfilled_explain: {
    input: {
      pollOptions: [
        {
          label: "For",
          votes: 0,
          position: 1,
        },
        {
          label: "Against",
          votes: 5,
          position: 2,
        },
        {
          label: "Abstain",
          votes: 0,
          position: 3,
        },
      ],
    },
    output: {
      finalResult: "Against",
      confidence: 9,
      reasoning: `## Governance Proposal Analysis Report

### 1. Executive Summary

- **Final Decision:** Against
- **Confidence Score:** 9 / 10

### 2. Data Overview

| Data Source        | For                | Against            | Key Metrics                                                     |
| :----------------- | :----------------- | :----------------- | :-------------------------------------------------------------- |
| **Twitter Poll**   | 0%                 | 100%               | Total Votes: 5                                                 |
| **Tweet Comments** | 0%                 | 0%                 | Key Arguments: No comments available                            |
| **On-Chain Vote**  | 0                  | 1047               | Participating Addresses: 2, Vote Distribution: Dominated by two large votes |

### 3. Comprehensive Analysis and Reasoning

**A. Twitter Poll Analysis (40%)**
The Twitter poll shows a unanimous result against the proposal with 100% of the 5 votes cast being "Against." The participation is low, which limits the representativeness of the poll, but there are no signs of bot activity or manipulation given the small scale.

**B. Tweet Comment Analysis (30%)**
There are no comments available for analysis, which means there is no additional sentiment or argument quality data to consider from this source.

**C. On-Chain Voting Analysis (30%)**
The on-chain voting data shows a strong "Against" sentiment with a total of 1047 votes against the proposal. The participation breadth is limited with only two addresses casting votes, indicating a lack of decentralization. However, the depth of the votes is significant, suggesting that these are likely influential stakeholders.

### 4. Rationale for Final Decision

The decision to recommend "Against" is based on the consistent opposition seen in both the Twitter poll and the on-chain voting data. The lack of comments does not provide additional insights, but the strong "Against" sentiment in the on-chain votes, which are likely from significant stakeholders, supports this conclusion.

### 5. Risks and Considerations

The primary risk identified is the low participation in both the Twitter poll and on-chain voting, which may not fully represent the community's views. Additionally, the concentration of voting power in a few addresses suggests potential centralization issues that should be addressed to ensure more democratic governance processes in the future.`,
      reasoningLite:
        "The final decision is 'Against' due to unanimous opposition in both Twitter polls and on-chain votes, with significant stakeholder influence evident in the latter.",
      votingBreakdown: {
        twitterPoll: {
          for: 0,
          against: 100,
          abstain: 0,
        },
        twitterComments: {
          positive: 0,
          negative: 0,
          neutral: 0,
        },
        onChainVotes: {
          for: 0,
          against: 1047,
          abstain: 0,
        },
      },
    },
  },
  ctime: "2025-06-20T06:24:11.879Z",
  utime: "2025-06-20T06:40:10.238Z",
  dao: {
    name: "DeGov Development Test DAO",
    code: "degov-test-dao",
    xprofile: "roasted",
    links: {
      website: "https://demo.degov.ai",
      config: "https://demo.degov.ai/degov.yml",
      indexer: "https://degov-indexer.vercel.app/graphql",
    },
    config: {
      name: "DeGov Development Test DAO",
      logo: "/example/logo.svg",
      siteUrl: "https://degov-dev.vercel.app",
      offChainDiscussionUrl:
        "https://github.com/ringecosystem/degov/discussions",
      description:
        "This is the development test DAO interface for DeGov users, allowing them to gain \nfirsthand experience creating proposals and voting on them before deploying \ntheir own DeGov instance. The DAO is built on the Darwinia chain, an Ethereum-compatible chain.\n",
      links: {
        website: "https://ringdao.com/",
        twitter: "https://x.com/ringecosystem",
        discord: "https://discord.com/invite/BhNbKWWfGV",
        telegram: "https://t.me/ringecosystem",
        github: "https://github.com/ringecosystem/degov",
      },
      wallet: {
        walletConnectProjectId: "2719448e2ce94fdd269a3c8587123bcc",
      },
      chain: {
        name: "Darwinia Network",
        rpcs: ["https://rpc.darwinia.network"],
        explorers: ["https://explorer.darwinia.network"],
        contracts: {
          multicall3: {
            address: "0xca11bde05977b3631167028862be2a173976ca11",
            blockCreated: 69420,
          },
        },
        nativeToken: {
          priceId: "darwinia-network-native-token",
          symbol: "RING",
          decimals: 18,
        },
        id: 46,
        logo: "https://darwinia.network/images/darwinia-logo-black-background-round.svg",
      },
      indexer: {
        endpoint: "https://degov-indexer.vercel.app/graphql",
        startBlock: 5873342,
        rpc: "wss://rpc.darwinia.network",
      },
      contracts: {
        governor: "0xC9EA55E644F496D6CaAEDcBAD91dE7481Dcd7517",
        governorToken: {
          address: "0xbC9f58566810F7e853e1eef1b9957ac82F9971df",
          standard: "ERC20",
        },
        timeLock: "0x6AB15C6ada9515A8E21321e241013dB457C8576c",
      },
      timeLockAssets: [
        {
          name: "FT",
          contract: "0x3ff4F23F328664FfD046eb4ca62be3d8aF3e452f",
          standard: "ERC20",
          priceId: "FT",
        },
        {
          name: "NFT",
          contract: "0xA785c85dADa2dFF129b3eba7523bD380eA8b4e2A",
          standard: "ERC721",
          priceId: "NFT",
        },
      ],
      safes: [
        {
          name: "Test DAO Safe(Arbitrum)",
          chainId: 42161,
          link: "https://app.safe.global/home?safe=arb1:0x80d180621B2f875269216f19A499e6fB9402776C",
        },
        {
          name: "Test DAO Safe(Sepolia)",
          chainId: 11155111,
          link: "https://app.safe.global/home?safe=sep:0x80d180621B2f875269216f19A499e6fB9402776C",
        },
      ],
    },
    lastProcessedBlock: 7248238,
  },
  twitter_user: {
    id: "1935546438748110848",
    name: "DeGovRoasted",
    username: "DeGovRoasted",
    verified: false,
  },
};
