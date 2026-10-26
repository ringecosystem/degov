import { useCallback } from "react";
import { useWriteContract } from "wagmi";

import { abi as GovernorAbi } from "@/config/abi/governor";

import { useContractGuard } from "./useContractGuard";
import { useDaoConfig } from "./useDaoConfig";
import { calculateDescriptionHash } from "./useProposal";

const useExecuteProposal = () => {
  const daoConfig = useDaoConfig();
  const { writeContractAsync, isPending } = useWriteContract();
  const { validateBeforeExecution } = useContractGuard();
  const executeProposal = useCallback(
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
        functionName: "execute",
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
  return { executeProposal, isPending };
};

export default useExecuteProposal;
