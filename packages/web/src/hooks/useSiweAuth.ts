'use client';
import { useCallback, useState } from 'react';
import { createSiweMessage } from 'viem/siwe';
import { useAccount, useSignMessage, useChainId } from 'wagmi';

import { useAuth } from '@/contexts/auth';

export const useSiweAuth = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { setToken } = useAuth();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const { signMessageAsync } = useSignMessage();

  const getNonce = useCallback(async (): Promise<string> => {
    const response = await fetch('/api/auth/nonce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    const { data } = await response.json();
    return data.nonce;
  }, []);

  const createMessage = useCallback((address: `0x${string}`, nonce: string) => {
    return createSiweMessage({
      domain: typeof window !== 'undefined' ? window.location.host : 'apps.degov.ai',
      address,
      statement: `DeGov.AI wants you to sign in with your Ethereum account: ${address}`,
      uri: typeof window !== 'undefined' ? window.location.origin : 'https://apps.degov.ai',
      version: '1',
      chainId,
      nonce,
    });
  }, [chainId]);

  const authenticate = useCallback(async (): Promise<boolean> => {
    if (!isConnected || !address) {
      console.error('Please connect your wallet first');
      return false;
    }

    setIsAuthenticating(true);

    try {
      const nonce = await getNonce();
      if (!nonce) {
        throw new Error('Failed to get nonce');
      }

      const message = createMessage(address, nonce);
      const signature = await signMessageAsync({ message });

      const verifyRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, signature }),
        cache: 'no-store',
      });

      const response = await verifyRes.json();

      if (response?.code === 0 && response?.data?.token) {
        setToken(response.data.token);
        return true;
      }

      return false;

    } catch (error) {
      console.error('Authentication failed:', error);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [isConnected, address, getNonce, createMessage, signMessageAsync, setToken]);

  return {
    authenticate,
    isAuthenticating,
    canAuthenticate: isConnected && !!address
  };
};