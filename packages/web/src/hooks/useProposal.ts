import { Interface } from "ethers";
import { useCallback, useEffect, useState } from "react";
import { keccak256, stringToBytes } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";

import { abi as governorAbi } from "@/config/abi/governor";

import { useConfig } from "./useConfig";

import type { InterfaceAbi } from "ethers";

export interface ProposalActionParam {
  target: `0x${string}`;
  value: bigint;
  abi: InterfaceAbi;
  functionName: string;
  params: readonly unknown[];
}

export const calculateDescriptionHash = (description: string) => {
  return keccak256(stringToBytes(description));
};

export const useProposal = () => {
  const daoConfig = useConfig();
  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();

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
      try {
        const targets: `0x${string}`[] = [];
        const values: bigint[] = [];
        const calldatas: `0x${string}`[] = [];

        for (const action of actions) {
          const iface = new Interface(action.abi);
          const func = iface.getFunction(action.functionName);
          const calldata = iface.encodeFunctionData(
            func!,
            action.params
          ) as `0x${string}`;

          targets.push(action.target);
          values.push(action.value);
          calldatas.push(calldata);
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
        }

        setParams({
          targets,
          values,
          calldatas,
          description,
        });

        const data = await writeContractAsync({
          address: daoConfig?.contracts?.governorContract as `0x${string}`,
          abi: governorAbi,
          functionName: "propose",
          args: [targets, values, calldatas, description],
        });

        return data;
      } catch (error) {
        console.error("Failed to create proposal:", error);
        throw error;
      }
    },
    [address, daoConfig, writeContractAsync]
  );

  const { data: proposalId, isLoading: isLoadingProposalId } = useReadContract({
    address: daoConfig?.contracts?.governorContract as `0x${string}`,
    abi: governorAbi,
    functionName: "hashProposal",
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
        !!params.description,
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
