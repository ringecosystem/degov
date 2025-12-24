import { v4 as uuidv4 } from "uuid";
import { parseUnits } from "viem";

import { abi as multiPortAbi } from "@/config/abi/multiPort";
import { abi as tokenAbi } from "@/config/abi/token";
import type { ProposalActionParam } from "@/hooks/useProposal";
import { extractMethodNameFromSignature } from "@/utils";

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
/** *
 * generate function signature
 *
 * @param methodName contract method name
 * @param params parameter list
 * @param options options
 * @returns function signature string
 */
function generateFunctionSignature(
  methodName: string | undefined,
  params: CustomContent["calldata"] | undefined,
  options: {
    useTypes?: boolean;
    includeNames?: boolean;
  } = { useTypes: false, includeNames: false }
): string {
  if (!methodName) return "";

  const finalMethodName = methodName ? methodName.split("-")[0] : "";

  // Handle case with no parameters
  if (!params || params.length === 0) {
    return `${finalMethodName}()`;
  }

  // Generate parameter list based on options
  const paramList = params
    .map((param) => {
      if (options.useTypes && options.includeNames) {
        // Include both type and name: "address target"
        return `${param.type} ${param.name}`;
      } else if (options.useTypes) {
        // Only type: "address"
        return param.type;
      } else {
        // Only name: "target"
        return param.name;
      }
    })
    .join(", ");

  return `${finalMethodName}(${paramList})`;
}

export const transformActionsToProposalParams = async (
  actions: Action[],
  decimals: number = 18
): Promise<{
  description: string;
  discussion?: string;
  actions: ProposalActionParam[];
}> => {
  const proposalAction = actions.find((action) => action.type === "proposal");
  const html = proposalAction?.content.markdown ?? "";
  const description = proposalAction
    ? `# ${proposalAction.content.title}\n\n${html}`
    : "";
  const discussion = proposalAction?.content.discussion;
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
          { useTypes: true, includeNames: true }
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
    discussion,
    actions: proposalActions,
  };
};
