"use client";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useCallback } from "react";
import { useAccount } from "wagmi";

import { tokenManager } from "@/lib/auth/token-manager";

import { useSiweAuth } from "./useSiweAuth";

export interface EnsureAuthResult {
  success: boolean;
  error?: string;
}

export const useEnsureAuth = () => {
  const { isConnected, address } = useAccount();

  const { openConnectModal } = useConnectModal();
  const { authenticate, isAuthenticating } = useSiweAuth();

  const ensureAuth = useCallback(async (): Promise<EnsureAuthResult> => {
    try {
      if (!isConnected) {
        if (!openConnectModal) {
          return {
            success: false,
            error: "Connect modal not available",
          };
        }

        openConnectModal();
        return {
          success: false,
          error: "Please connect your wallet",
        };
      }

      if (tokenManager.getToken(address)) {
        return { success: true };
      }

      const authResult = await authenticate();

      return {
        success: authResult.success,
        error: authResult.error,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }, [isConnected, address, openConnectModal, authenticate]);

  return {
    ensureAuth,
    isAuthenticating,
    isConnected,
    isAuthenticated: !!tokenManager.getToken(address),
  };
};
