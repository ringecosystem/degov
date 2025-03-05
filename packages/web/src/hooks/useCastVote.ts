import { useCallback } from "react";
import { useWriteContract } from "wagmi";

import { abi as GovernorAbi } from "@/config/abi/governor";

import { useConfig } from "./useConfig";

export const useCastVote = () => {
  const daoConfig = useConfig();
  const { writeContractAsync, isPending } = useWriteContract();

  const castVote = useCallback(
    async ({
      proposalId,
      support,
      reason,
    }: {
      proposalId: bigint;
      support: number;
      reason: string;
    }) => {
      if (!daoConfig?.contracts?.governorContract) {
        throw new Error("Governor contract not found");
      }

      return await writeContractAsync({
        address: daoConfig.contracts.governorContract as `0x${string}`,
        abi: GovernorAbi,
        functionName: "castVoteWithReason",
        args: [proposalId, support, reason],
      });
    },
    [daoConfig, writeContractAsync]
  );
  return { castVote, isPending };
};

export default useCastVote;
