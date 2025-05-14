import { v4 as uuidv4 } from "uuid";
import { parseUnits } from "viem";

import { abi as multiPortAbi } from "@/config/abi/multiPort";
import { abi as tokenAbi } from "@/config/abi/token";
import type { ProposalActionParam } from "@/hooks/useProposal";
import { extractMethodNameFromSignature } from "@/utils";
import { markdownToHtml } from "@/utils/markdown";

import type { CustomContent, XAccountContent } from "./schema";
import type {
  Action,
  CustomAction,
  ProposalAction,
  TransferAction,
  XAccountAction,
} from "./type";
import type { InterfaceAbi } from "ethers";
import type { Address } from "viem";

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

export const generateXAccountAction = (): XAccountAction => {
  return {
    id: uuidv4(),
    type: "xaccount",
    content: {} as XAccountContent,
  };
};
/**
 * generateFunctionSignature
 *
 * generate function signature
 *
 * @param methodName contract method name
 * @param params parameter list
 * @param options options
 * @returns function signature string
 */
export function generateFunctionSignature(
  methodName: string | undefined,
  params: CustomContent["calldata"] | undefined,
  options: {
    useTypes?: boolean;
  } = { useTypes: false }
): string {
  if (!methodName) return "";

  const finalMethodName = methodName ? methodName.split("-")[0] : "";

  // Handle case with no parameters
  if (!params || params.length === 0) {
    return `${finalMethodName}()`;
  }

  // Use parameter types or names based on options
  const paramList = params
    .map((param) => (options.useTypes ? param.type : param.name))
    .join(",");

  return `${finalMethodName}(${paramList})`;
}

export const transformActionsToProposalParams = async (
  actions: Action[],
  decimals: number = 18
): Promise<{ description: string; actions: ProposalActionParam[] }> => {
  const proposalAction = actions.find((action) => action.type === "proposal");
  const html = proposalAction?.content.markdown ?? "";
  const description = proposalAction
    ? `# ${proposalAction.content.title}\n\n${html}`
    : "";

  const proposalActions: ProposalActionParam[] = actions
    .filter(
      (action) =>
        action.type === "transfer" ||
        action.type === "custom" ||
        action.type === "xaccount"
    )
    .map((action) => {
      if (action.type === "transfer") {
        return {
          type: "transfer",
          target: action.content.recipient,
          value: action.content.amount
            ? parseUnits(action.content.amount, decimals)
            : 0n,
          abi: tokenAbi as InterfaceAbi,
          functionName: "transfer",
          params: [
            action.content.recipient,
            parseUnits(action.content.amount, decimals),
          ],
        };
      } else if (action.type === "custom") {
        const customAction = action.content;
        const signature = generateFunctionSignature(
          customAction.contractMethod,
          customAction.calldata,
          { useTypes: true }
        );

        return {
          type: "custom",
          target: customAction.target,
          value: customAction.value
            ? parseUnits(customAction.value, decimals)
            : 0n,
          abi: customAction.customAbiContent as InterfaceAbi,
          functionName: customAction.contractMethod
            ? customAction.contractMethod.split("-")[0]
            : "",
          params: customAction?.calldata?.map(
            (item) => item.value
          ) as readonly unknown[],
          signature,
        };
      } else if (action.type === "xaccount") {
        return {
          type: "xaccount",
          target: action.content?.crossChainCall?.port,
          value: action.content?.crossChainCall?.value
            ? BigInt(action.content?.crossChainCall?.value)
            : 0n,
          abi: multiPortAbi as InterfaceAbi,
          functionName:
            extractMethodNameFromSignature(
              action.content?.crossChainCall?.function ?? ""
            ) ?? "",
          params: Object.values(action.content?.crossChainCall?.params),
          signature: action.content?.crossChainCall?.function ?? "",
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
          type: "function",
          name: "approve",
          stateMutability: "nonpayable",
          inputs: [
            {
              name: "spender",
              type: "address",
            },
            {
              name: "amount",
              type: "uint256[]",
            },
          ],
          outputs: [
            {
              type: "bool",
            },
          ],
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
          type: "uint256[]",
          value: ["2500", "2500"],
          isArray: true,
        },
      ],
      value: "0",
    },
  },
];
