import { useCallback } from "react";
import { useWriteContract } from "wagmi";

import { abi as GovernorAbi } from "@/config/abi/governor";

import { useContractGuard } from "./useContractGuard";
import { useDaoConfig } from "./useDaoConfig";
const useCastVote = () => {
  const daoConfig = useDaoConfig();
  const { writeContractAsync, isPending } = useWriteContract();
  const { validateBeforeExecution } = useContractGuard();

  const castVote = useCallback(
    async ({
      proposalId,
      support,
      reason,
      governor,
      chainId,
    }: {
      proposalId: bigint;
      support: number;
      reason: string;
      governor?: `0x${string}`;
      chainId?: number;
    }) => {
      const contract =
        governor ?? (daoConfig?.contracts?.governor as `0x${string}` | undefined);
      if (!contract) {
        throw new Error("Governor contract not found");
      }
      const isValid = validateBeforeExecution();
      if (!isValid) return;
      return await writeContractAsync({
        address: contract,
        chainId,
        abi: GovernorAbi,
        functionName: "castVoteWithReason",
        args: [proposalId, support, reason],
      });
    },
    [daoConfig, writeContractAsync, validateBeforeExecution]
  );
  return { castVote, isPending };
};

export default useCastVote;
