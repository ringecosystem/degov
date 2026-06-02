"use client";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { siweService } from "@/lib/auth/siwe-service";

import { useSiweAuth } from "./useSiweAuth";

export interface EnsureAuthResult {
  success: boolean;
  error?: string;
}

export const useEnsureAuth = () => {
  const { isConnected, address } = useAccount();

  const { openConnectModal } = useConnectModal();
  const { authenticate, isAuthenticating } = useSiweAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) {
      setIsAuthenticated(false);
    }
  }, [address, isConnected]);

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

      const currentSession = await siweService.getAuthStatus(address);
      if (currentSession.authenticated) {
        setIsAuthenticated(true);
        return { success: true };
      }

      const authResult = await authenticate();
      setIsAuthenticated(authResult.success);

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
    isAuthenticated,
  };
};
