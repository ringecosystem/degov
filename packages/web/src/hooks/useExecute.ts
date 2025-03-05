import { useCallback } from "react";
import { useWriteContract } from "wagmi";

import { abi as GovernorAbi } from "@/config/abi/governor";

import { useConfig } from "./useConfig";
import { calculateDescriptionHash } from "./useProposal";

export const useExecuteProposal = () => {
  const daoConfig = useConfig();
  const { writeContractAsync, isPending } = useWriteContract();

  const executeProposal = useCallback(
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
      if (!daoConfig?.contracts?.governorContract) {
        throw new Error("Governor contract not found");
      }

      return await writeContractAsync({
        address: daoConfig.contracts.governorContract as `0x${string}`,
        abi: GovernorAbi,
        functionName: "execute",
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
  return { executeProposal, isPending };
};

export default useExecuteProposal;
