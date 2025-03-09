import { useCallback } from "react";
import { useWriteContract } from "wagmi";

import { abi as tokenAbi } from "@/config/abi/token";

import { useConfig } from "./useConfig";
import { useContractGuard } from "./useContractGuard";

import type { Address } from "viem";

export const useDelegate = () => {
  const daoConfig = useConfig();
  const { writeContractAsync, isPending } = useWriteContract();
  const { validateBeforeExecution } = useContractGuard();
  const delegate = useCallback(
    async (delegatee: Address) => {
      const isValid = validateBeforeExecution();
      if (!isValid) return;
      const hash = await writeContractAsync({
        address: daoConfig?.contracts?.governorToken?.contract as `0x${string}`,
        abi: tokenAbi,
        functionName: "delegate",
        args: [delegatee],
      });

      return hash;
    },
    [
      writeContractAsync,
      daoConfig?.contracts?.governorToken?.contract,
      validateBeforeExecution,
    ]
  );

  return {
    delegate,
    isPending,
  };
};
