import { useCallback } from "react";
import { useWriteContract } from "wagmi";

import { abi as GovernorAbi } from "@/config/abi/governor";

import { useContractGuard } from "./useContractGuard";
import { useDaoConfig } from "./useDaoConfig";
import { calculateDescriptionHash } from "./useProposal";

const useQueueProposal = () => {
  const daoConfig = useDaoConfig();
  const { writeContractAsync, isPending } = useWriteContract();
  const { validateBeforeExecution } = useContractGuard();
  const queueProposal = useCallback(
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
      const isValid = validateBeforeExecution();
      if (!isValid) return;

      return await writeContractAsync({
        address: daoConfig.contracts.governor as `0x${string}`,
        abi: GovernorAbi,
        functionName: "queue",
        args: [
          targets,
          values,
          calldatas,
          calculateDescriptionHash(description),
        ],
      });
    },
    [daoConfig, writeContractAsync, validateBeforeExecution]
  );
  return { queueProposal, isPending };
};

export default useQueueProposal;
