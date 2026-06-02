import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useCallback } from "react";
import { toast } from "react-toastify";
import { useSwitchChain } from "wagmi";

import { useConnectWalletStatus } from "./useConnectWalletStatus";

export function useContractGuard() {
  const { isConnected, isCorrectNetwork, chainId } = useConnectWalletStatus();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();

  /**
   * Validate wallet status before contract interactions
   * Returns a promise that resolves when all checks pass or rejects with an error
   *
   * @param options Configuration options
   * @returns A promise that resolves if all checks pass
   */
  const validateBeforeExecution = useCallback((): boolean => {
    // Check wallet connection
    if (!isConnected) {
      if (openConnectModal) {
        try {
          openConnectModal();
        } catch (err) {
          const errorMessage =
            (err as { shortMessage?: string; message?: string }).shortMessage ||
            (err as { shortMessage?: string; message?: string }).message ||
            "Failed to open connect modal";
          toast.error(errorMessage);
          return false;
        }
      }
      return false;
    }

    if (!isCorrectNetwork) {
      if (chainId) {
        try {
          switchChain({ chainId });
        } catch (err) {
          const errorMessage =
            (err as { shortMessage?: string; message?: string }).shortMessage ||
            (err as { shortMessage?: string; message?: string }).message ||
            "Failed to switch network";
          toast.error(errorMessage);
          return false;
        }
      }
      return false;
    }
    return true;
  }, [isConnected, isCorrectNetwork, openConnectModal, switchChain, chainId]);

  return {
    validateBeforeExecution,
  };
}
