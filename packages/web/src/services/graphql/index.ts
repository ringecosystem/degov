import { request } from "./client";
import * as Queries from "./queries";
import * as Types from "./types";

export const proposalService = {
  getAllProposals: async (
    endpoint: string,
    options: {
      limit?: number;
      offset?: number;
      orderBy?: string;
    } = {}
  ) => {
    const response = await request<Types.ProposalListResult>(
      endpoint,
      Queries.GET_ALL_PROPOSALS,
      options
    );
    console.log("response", response);
    // return response.proposals;
    // faker data
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return [
      {
        id: "1",
        proposalId:
          "74450553702603116923930938983559663877178222191812327317223244920657272284157",
        blockNumber: 12345678,
        blockTimestamp: Math.floor(Date.now() / 1000) - 86400 * 30, // 30天前
        description: "# test23333333\n\n<p>​test23333333</p>\n",
        calldatas: ["0x1234567890abcdef"],
        signatures: ["transfer(address,uint256)"],
        targets: ["0x1234567890123456789012345678901234567890"],
        voteStart: Math.floor(Date.now() / 1000) - 86400 * 25, // 25天前
        voteEnd: Math.floor(Date.now() / 1000) - 86400 * 18, // 18天前
      },
      {
        id: "2",
        proposalId:
          "70353758196327868741630973529029135049944832439495443129828493028681126838934",
        blockNumber: 12346789,
        blockTimestamp: Math.floor(Date.now() / 1000) - 86400 * 20, // 20天前
        description: "# Bear Test\ngggg",
        calldatas: ["0xabcdef1234567890"],
        signatures: ["setParams(uint256,uint256)"],
        targets: ["0x2345678901234567890123456789012345678901"],
        voteStart: Math.floor(Date.now() / 1000) - 86400 * 18, // 18天前
        voteEnd: Math.floor(Date.now() / 1000) - 86400 * 11, // 11天前
      },
      {
        id: "3",
        proposalId: "3",
        blockNumber: 12350123,
        blockTimestamp: Math.floor(Date.now() / 1000) - 86400 * 15, // 15天前
        description: "# test proposal 11111\ntest proposal 11111",
        calldatas: ["0x7890abcdef123456"],
        signatures: ["approveIntegration(address)"],
        targets: ["0x3456789012345678901234567890123456789012"],
        voteStart: Math.floor(Date.now() / 1000) - 86400 * 14, // 14天前
        voteEnd: Math.floor(Date.now() / 1000) - 86400 * 7, // 7天前
      },
      {
        id: "4",
        proposalId: "4",
        blockNumber: 12355678,
        blockTimestamp: Math.floor(Date.now() / 1000) - 86400 * 10, // 10天前
        description: "# 1\n1",
        calldatas: ["0x456789abcdef0123"],
        signatures: ["allocateFunds(address,uint256)"],
        targets: ["0x4567890123456789012345678901234567890123"],
        voteStart: Math.floor(Date.now() / 1000) - 86400 * 9, // 9天前
        voteEnd: Math.floor(Date.now() / 1000) - 86400 * 2, // 2天前
      },
      {
        id: "5",
        proposalId: "5",
        blockNumber: 12360123,
        blockTimestamp: Math.floor(Date.now() / 1000) - 86400 * 5, // 5天前
        description: "# test proposal 11111\ntest proposal 11111",
        calldatas: ["0xdef0123456789abc"],
        signatures: ["upgradeImplementation(address)"],
        targets: ["0x5678901234567890123456789012345678901234"],
        voteStart: Math.floor(Date.now() / 1000) - 86400 * 4, // 4天前
        voteEnd: Math.floor(Date.now() / 1000) + 86400 * 3, // 3天后
      },
      {
        id: "6",
        proposalId: "6",
        blockNumber: 12365678,
        blockTimestamp: Math.floor(Date.now() / 1000) - 86400 * 3, // 3天前
        description: "Proposal to adjust token emission schedule",
        calldatas: ["0x0123456789abcdef"],
        signatures: ["setEmissionRate(uint256)"],
        targets: ["0x6789012345678901234567890123456789012345"],
        voteStart: Math.floor(Date.now() / 1000) - 86400 * 2, // 2天前
        voteEnd: Math.floor(Date.now() / 1000) + 86400 * 5, // 5天后
      },
      {
        id: "7",
        proposalId: "7",
        blockNumber: 12370123,
        blockTimestamp: Math.floor(Date.now() / 1000) - 86400 * 1, // 1天前
        description:
          "Proposal to establish strategic partnership with Protocol X",
        calldatas: ["0x89abcdef01234567"],
        signatures: ["approvePartnership(address,uint256)"],
        targets: ["0x7890123456789012345678901234567890123456"],
        voteStart: Math.floor(Date.now() / 1000), // 现在
        voteEnd: Math.floor(Date.now() / 1000) + 86400 * 7, // 7天后
      },
      {
        id: "8",
        proposalId: "8",
        blockNumber: 12375678,
        blockTimestamp: Math.floor(Date.now() / 1000) - 3600, // 1小时前
        description:
          "Emergency proposal to fix critical security vulnerability",
        calldatas: ["0xcdef0123456789ab"],
        signatures: ["patchSecurity(address)"],
        targets: ["0x8901234567890123456789012345678901234567"],
        voteStart: Math.floor(Date.now() / 1000), // 现在
        voteEnd: Math.floor(Date.now() / 1000) + 86400 * 2, // 2天后
      },
      {
        id: "9",
        proposalId: "9",
        blockNumber: 12380123,
        blockTimestamp: Math.floor(Date.now() / 1000), // 现在
        description: "Proposal to add new token to treasury",
        calldatas: ["0xef0123456789abcd"],
        signatures: ["addToken(address)"],
        targets: ["0x9012345678901234567890123456789012345678"],
        voteStart: Math.floor(Date.now() / 1000) + 3600, // 1小时后
        voteEnd: Math.floor(Date.now() / 1000) + 86400 * 8, // 8天后
        votesFor: 0,
        votesAgainst: 0,
        totalVotes: { value: 0, total: 1500000 },
      },
      {
        id: "10",
        proposalId: "10",
        blockNumber: 12385678,
        blockTimestamp: Math.floor(Date.now() / 1000), // 现在
        description: "Proposal to revise community guidelines",
        calldatas: ["0xf0123456789abcde"],
        signatures: ["updateGuidelines(string)"],
        targets: ["0x0123456789012345678901234567890123456789"],
        voteStart: Math.floor(Date.now() / 1000) + 86400, // 1天后
        voteEnd: Math.floor(Date.now() / 1000) + 86400 * 9, // 9天后
      },
      {
        id: "11",
        proposalId: "11",
        blockNumber: 12390123,
        blockTimestamp: Math.floor(Date.now() / 1000), // 现在
        description: "Proposal to add new token to treasury",
      },
      {
        id: "12",
        proposalId: "12",
        blockNumber: 12395678,
        blockTimestamp: Math.floor(Date.now() / 1000), // 现在
        description: "Proposal to add new token to treasury",
      },
    ];
  },
};

export { Types };

export { Queries };
