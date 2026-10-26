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
      governor,
      chainId,
    }: {
      targets: `0x${string}`[];
      values: bigint[];
      calldatas: `0x${string}`[];
      description: string;
      governor?: `0x${string}`;
      chainId?: number;
    }) => {
      const contract =
        governor ?? (daoConfig?.contracts?.governor as `0x${string}` | undefined);
      if (!contract) {
        throw new Error("Governor contract not found");
      }
      if (!(governor && chainId)) {
        const isValid = validateBeforeExecution();
        if (!isValid) return;
      }
      return await writeContractAsync({
        address: contract,
        chainId,
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
