import { v4 as uuidv4 } from "uuid";
import { Address, parseUnits } from "viem";
import { abi as tokenAbi } from "@/config/abi/token";
import type {
  Action,
  CustomAction,
  ProposalAction,
  TransferAction,
} from "./type";
import { markdownToHtml } from "@/utils/markdown";
import type { InterfaceAbi } from "ethers";
import type { ProposalActionParam } from "@/hooks/useProposal";

export const generateProposalAction = (): ProposalAction => {
  return {
    id: uuidv4(),
    type: "proposal",
    content: {
      title: "",
      markdown: "\u200B",
    },
  };
};

export const generateTransferAction = (): TransferAction => {
  return {
    id: uuidv4(),
    type: "transfer",
    content: {
      recipient: "" as Address,
      amount: "",
    },
  };
};

export const generateCustomAction = (): CustomAction => {
  return {
    id: uuidv4(),
    type: "custom",
    content: {
      target: "" as Address,
      contractType: "",
      contractMethod: "",
      customAbiContent: [],
      calldata: [],
      value: "",
    },
  };
};

export const transformActionsToProposalParams = async (
  actions: Action[],
  decimals: number = 18
): Promise<{ description: string; actions: ProposalActionParam[] }> => {
  const proposalAction = actions.find((action) => action.type === "proposal");
  const html = await markdownToHtml(proposalAction?.content.markdown ?? "");
  const description = proposalAction
    ? `# ${proposalAction.content.title}\n\n${html}`
    : "";

  const proposalActions: ProposalActionParam[] = actions
    .filter((action) => action.type === "transfer" || action.type === "custom")
    .map((action) => {
      if (action.type === "transfer") {
        return {
          target: action.content.recipient,
          value: 0n,
          abi: tokenAbi as InterfaceAbi,
          functionName: "transfer",
          params: [
            action.content.recipient,
            parseUnits(action.content.amount, decimals),
          ],
        };
      } else if (action.type === "custom") {
        const customAction = action.content;

        return {
          target: customAction.target,
          value: customAction.value
            ? parseUnits(customAction.value, decimals)
            : 0n,
          abi: customAction.customAbiContent as InterfaceAbi,
          functionName: customAction.contractMethod,
          params: customAction?.calldata?.map(
            (item) => item.value
          ) as readonly unknown[],
        };
      }
      throw new Error("Invalid action type");
    });

  return {
    description,
    actions: proposalActions,
  };
};

export const MOCK_ACTIONS: Action[] = [
  {
    id: "proposal-1",
    type: "proposal",
    content: {
      title: "Protocol Parameter Update and Treasury Allocation Q4 2023",
      markdown: `# Protocol Parameter Update and Treasury Allocation
## Summary
This proposal aims to:
1. Update key protocol parameters for improved efficiency
2. Allocate treasury funds for Q4 2023 operations
3. Implement new security measures

## Detailed Specification

### Parameter Updates
| Parameter | Current Value | Proposed Value |
|-----------|--------------|----------------|
| Min Stake | 1000 TOKEN | 1500 TOKEN |
| Lock Period | 14 days | 21 days |
| Fee Rate | 0.3% | 0.25% |

### Treasury Allocation
- Development Fund: 50,000 TOKEN
- Security Audit: 25,000 TOKEN
- Community Rewards: 25,000 TOKEN

### Security Implementation
The proposal includes implementation of new security features through the protocol's upgrade mechanism.

## Technical Implementation
The changes will be executed through a series of contract calls and transfers as detailed in the actions below.

## Timeline
Implementation will begin immediately upon proposal approval.`,
    },
  },
  {
    id: "transfer-1",
    type: "transfer",
    content: {
      recipient: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199" as Address,
      amount: "50000",
    },
  },
  {
    id: "transfer-2",
    type: "transfer",
    content: {
      recipient: "0xdD2FD4581271e230360230F9337D5c0430Bf44C0" as Address,
      amount: "25000",
    },
  },
  {
    id: "custom-1",
    type: "custom",
    content: {
      target: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address,
      contractType: "erc-20",
      contractMethod: "approve",
      customAbiContent: [
        {
          name: "spender",
          type: "address",
          value: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199",
          isArray: false,
        },
      ],
      calldata: [
        {
          name: "spender",
          type: "address",
          value: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199",
          isArray: false,
        },
        {
          name: "amount",
          type: "uint256",
          value: "1500000000000000000000",
          isArray: false,
        },
        {
          name: "amount",
          type: "uint256[]",
          value: ["2500", "2500"],
          isArray: true,
        },
        {
          name: "v",
          type: "bytes32[]",
          value: [
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          ],
          isArray: true,
        },
      ],
      value: "0",
    },
  },
  {
    id: "custom-2",
    type: "custom",
    content: {
      target: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address,
      contractType: "erc-20",
      contractMethod: "approve",
      customAbiContent: [
        {
          name: "spender",
          type: "address",
          value: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199",
          isArray: false,
        },
      ],
      calldata: [
        {
          name: "spender",
          type: "address",
          value: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199",
          isArray: false,
        },
        {
          name: "amount",
          type: "uint256",
          value: "1500000000000000000000",
          isArray: false,
        },
        {
          name: "amount",
          type: "uint256[]",
          value: ["2500", "2500"],
          isArray: true,
        },
        {
          name: "v",
          type: "bytes32[]",
          value: [
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          ],
          isArray: true,
        },
      ],
      value: "100",
    },
  },
];

transformActionsToProposalParams(MOCK_ACTIONS)?.then((res) => {
  console.log("transformActionsToProposalParams", res);
});
