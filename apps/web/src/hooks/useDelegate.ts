import { useCallback } from "react";
import { useWriteContract } from "wagmi";

import { abi as tokenAbi } from "@/config/abi/token";

import { useContractGuard } from "./useContractGuard";
import { useDaoConfig } from "./useDaoConfig";

import type { Address } from "viem";

export const useDelegate = () => {
  const daoConfig = useDaoConfig();
  const { writeContractAsync, isPending } = useWriteContract();
  const { validateBeforeExecution } = useContractGuard();
  const delegate = useCallback(
    async (
      delegatee: Address,
      options?: { token?: `0x${string}`; chainId?: number }
    ) => {
      const token =
        options?.token ??
        (daoConfig?.contracts?.governorToken?.address as `0x${string}` | undefined);
      if (!token) {
        throw new Error("Governor token not found");
      }
      if (!(options?.token && options.chainId)) {
        const isValid = validateBeforeExecution();
        if (!isValid) return;
      }
      const hash = await writeContractAsync({
        address: token,
        chainId: options?.chainId,
        abi: tokenAbi,
        functionName: "delegate",
        args: [delegatee],
      });

      return hash;
    },
    [
      writeContractAsync,
      daoConfig?.contracts?.governorToken?.address,
      validateBeforeExecution,
    ]
  );

  return {
    delegate,
    isPending,
  };
};
