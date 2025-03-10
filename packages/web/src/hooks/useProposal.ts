import { Interface } from "ethers";
import { useCallback, useEffect, useState } from "react";
import { keccak256, stringToBytes } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";

import { abi as governorAbi } from "@/config/abi/governor";

import { useContractGuard } from "./useContractGuard";
import { useDaoConfig } from "./useDaoConfig";

import type { InterfaceAbi } from "ethers";
export interface ProposalActionParam {
  type?: "transfer" | "custom";
  target: `0x${string}`;
  value: bigint;
  abi: InterfaceAbi;
  functionName: string;
  params: readonly unknown[];
  signature?: string;
}

export const calculateDescriptionHash = (description: string) => {
  return keccak256(stringToBytes(description));
};

export const useProposal = () => {
  const daoConfig = useDaoConfig();
  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const { validateBeforeExecution } = useContractGuard();
  const [params, setParams] = useState<{
    targets: `0x${string}`[];
    values: bigint[];
    calldatas: `0x${string}`[];
    description: string;
  }>({
    targets: [],
    values: [],
    calldatas: [],
    description: "",
  });

  const createProposal = useCallback(
    async (description: string, actions: ProposalActionParam[]) => {
      const isValid = validateBeforeExecution();
      if (!isValid) return;
      try {
        const signatures: string[] = [];
        const targets: `0x${string}`[] = [];
        const values: bigint[] = [];
        const calldatas: `0x${string}`[] = [];

        for (const action of actions) {
          const iface = new Interface(action.abi);
          const func = iface.getFunction(
            action.signature ?? action.functionName
          );
          const calldata =
            action?.type === "transfer"
              ? "0x"
              : (iface.encodeFunctionData(
                  func!,
                  action.params
                ) as `0x${string}`);

          targets.push(action.target);
          values.push(action.value);
          calldatas.push(calldata);
          signatures.push(action.signature ?? "");
        }

        if (
          targets.length === 0 &&
          values.length === 0 &&
          calldatas.length === 0
        ) {
          if (!address) throw new Error("No wallet connected");

          targets.push(address as `0x${string}`);
          values.push(BigInt(0));
          calldatas.push("0x" as `0x${string}`);
          signatures.push("");
        }

        let descriptionWithSignature = description;
        if (signatures.length > 0) {
          descriptionWithSignature = `${description}\n\n<signature>${JSON.stringify(
            signatures
          )}</signature>`;
        }

        setParams({
          targets,
          values,
          calldatas,
          description: descriptionWithSignature,
        });

        const data = await writeContractAsync({
          address: daoConfig?.contracts?.governor as `0x${string}`,
          abi: governorAbi,
          functionName: "propose",
          args: [targets, values, calldatas, descriptionWithSignature],
        });

        return data;
      } catch (error) {
        console.error("Failed to create proposal:", error);
        throw error;
      }
    },
    [address, daoConfig, writeContractAsync, validateBeforeExecution]
  );

  const { data: proposalId, isLoading: isLoadingProposalId } = useReadContract({
    address: daoConfig?.contracts?.governor as `0x${string}`,
    abi: governorAbi,
    functionName: "hashProposal",
    chainId: daoConfig?.network?.chainId,
    args: [
      params.targets,
      params.values,
      params.calldatas,
      calculateDescriptionHash(params.description ?? "0x"),
    ],
    query: {
      enabled:
        !!params.targets.length &&
        !!params.values.length &&
        !!params.calldatas.length &&
        !!params.description &&
        !!daoConfig?.network?.chainId,
    },
  });

  useEffect(() => {
    return () => {
      setParams({
        targets: [],
        values: [],
        calldatas: [],
        description: "",
      });
    };
  }, []);

  return {
    createProposal,
    isPending,
    proposalId: proposalId ? String(proposalId) : undefined,
    isLoadingProposalId,
  };
};
