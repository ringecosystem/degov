import { useCallback } from "react";
import { useWriteContract } from "wagmi";

import { abi as GovernorAbi } from "@/config/abi/governor";

import { useConfig } from "./useConfig";
import { calculateDescriptionHash } from "./useProposal";

export const useCancelProposal = () => {
  const daoConfig = useConfig();
  const { writeContractAsync, isPending } = useWriteContract();

  const cancelProposal = useCallback(
    async ({
      targets,
      values,
      calldatas,
      description,
    }: {
      targets: `0x${string}`[];
      values: bigint[];
      calldatas: `0x${string}`[];
      description: string;
    }) => {
      if (!daoConfig?.contracts?.governor) {
        throw new Error("Governor contract not found");
      }

      return await writeContractAsync({
        address: daoConfig.contracts.governor as `0x${string}`,
        abi: GovernorAbi,
        functionName: "cancel",
        args: [
          targets,
          values,
          calldatas,
          calculateDescriptionHash(description),
        ],
      });
    },
    [daoConfig, writeContractAsync]
  );
  return { cancelProposal, isPending };
};

export default useCancelProposal;
