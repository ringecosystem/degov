"use client";
import { useCallback, useState, useEffect } from "react";
import { useAccount, useSignMessage, useChainId } from "wagmi";

import { globalAuthManager } from "@/lib/auth/global-auth-manager";
import { siweService } from "@/lib/auth/siwe-service";

export interface AuthResult {
  success: boolean;
  token?: string;
  remoteToken?: string;
  error?: string;
}

// Imperative SIWE actions: authenticate and signOut.
// Keeps context/useAuth for reading auth state; avoids name clash.
export const useSiweAuth = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const { signMessageAsync } = useSignMessage();

  // Sync local isAuthenticating state with global state
  useEffect(() => {
    const checkGlobalAuthState = () => {
      const globalIsAuthenticating = globalAuthManager.getIsAuthenticating();
      if (globalIsAuthenticating !== isAuthenticating) {
        setIsAuthenticating(globalIsAuthenticating);
      }
    };

    // Check immediately and then periodically
    checkGlobalAuthState();
    const interval = setInterval(checkGlobalAuthState, 100);

    return () => clearInterval(interval);
  }, [isAuthenticating]);

  // Internal authentication function that does the actual work
  const performAuthentication = useCallback(async (): Promise<AuthResult> => {
    if (!isConnected || !address) {
      const errorMsg = "Please connect your wallet first";
      setError(new Error(errorMsg));
      return { success: false, error: errorMsg };
    }

    setError(null);

    try {
      const result = await siweService.authenticateWithWallet({
        address,
        chainId,
        signMessageAsync,
      });

      if (result.success && result.token) {
        // set token
      } else {
        setError(new Error(result.error || "Authentication failed"));
      }

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      return { success: false, error: error.message };
    }
  }, [isConnected, address, chainId, signMessageAsync]);

  // Public authenticate method that uses global auth manager
  const authenticate = useCallback(async (): Promise<AuthResult> => {
    return await globalAuthManager.authenticate(performAuthentication);
  }, [performAuthentication]);

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await siweService.signOut();
      setError(null);
      globalAuthManager.reset();
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  }, []);

  return {
    authenticate,
    signOut,

    // State
    isAuthenticating,
    error,
    canAuthenticate: isConnected && !!address,

    // Wallet state
    address,
    isConnected,
    chainId,
  };
};
