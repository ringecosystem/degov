import { useCallback } from "react";
import { useWriteContract } from "wagmi";

import { abi as GovernorAbi } from "@/config/abi/governor";

import { useContractGuard } from "./useContractGuard";
import { useDaoConfig } from "./useDaoConfig";
import { calculateDescriptionHash } from "./useProposal";
const useCancelProposal = () => {
  const daoConfig = useDaoConfig();
  const { validateBeforeExecution } = useContractGuard();
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
      const isValid = validateBeforeExecution();
      if (!isValid) return;
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
    [daoConfig, writeContractAsync, validateBeforeExecution]
  );
  return { cancelProposal, isPending };
};

export default useCancelProposal;
