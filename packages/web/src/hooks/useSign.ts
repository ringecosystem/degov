"use client";
import { useCallback, useState } from "react";
import { createSiweMessage } from "viem/siwe";
import { useAccount, useSignMessage } from "wagmi";

import { useDaoConfig } from "@/hooks/useDaoConfig";

export const TOKEN_KEY = "auth_token";

export const getToken = () => {
  return localStorage.getItem(TOKEN_KEY);
};

export const setToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

export function useSign() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const daoConfig = useDaoConfig();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const signIn = useCallback(async () => {
    if (!address) {
      throw new Error("No wallet connected");
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to get nonce");
      }

      const { data } = await response.json();

      const message = createSiweMessage({
        domain: window.location.host,
        address: address as `0x${string}`,
        statement: `DeGov.AI wants you to sign in with your Ethereum account: ${address}`,
        uri: window.location.origin,
        version: "1",
        chainId: daoConfig?.chain?.id as number,
        nonce: data.nonce,
      });

      const signature = await signMessageAsync({
        message: message,
      });

      const verifyResponse = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({ message, signature }),
      });

      const verifyData = await verifyResponse.json();

      if (verifyData.code !== 0 || !verifyData.data?.token) {
        throw new Error(verifyData.msg || "Authentication failed");
      }

      setToken(verifyData.data.token);
      setIsLoading(false);
      return verifyData.data.token;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setIsLoading(false);
      throw error;
    }
  }, [address, daoConfig?.chain?.id, signMessageAsync]);

  return {
    signIn,
    isLoading,
    error,
  };
}
