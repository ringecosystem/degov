'use client';
import { useCallback, useState } from 'react';
import { useAccount, useSignMessage, useChainId } from 'wagmi';

import { useAuth as useAuthContext } from '@/contexts/auth';
import { siweService } from '@/lib/auth/siwe-service';

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
  const { setToken } = useAuthContext();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const { signMessageAsync } = useSignMessage();

  const authenticate = useCallback(async (): Promise<AuthResult> => {
    if (!isConnected || !address) {
      const errorMsg = 'Please connect your wallet first';
      setError(new Error(errorMsg));
      return { success: false, error: errorMsg };
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      const result = await siweService.authenticateWithWallet({
        address,
        chainId,
        signMessageAsync,
      });

      if (result.success && result.token) {
        setToken(result.token);
      } else {
        setError(new Error(result.error || 'Authentication failed'));
      }

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      return { success: false, error: error.message };
    } finally {
      setIsAuthenticating(false);
    }
  }, [isConnected, address, chainId, signMessageAsync, setToken]);

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await siweService.signOut();
      setToken(null);
      setError(null);
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  }, [setToken]);

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
