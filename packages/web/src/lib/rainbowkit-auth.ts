"use client";
import { createAuthenticationAdapter } from "@rainbow-me/rainbowkit";
import { createSiweMessage } from "viem/siwe";

import { clearToken, setToken } from "@/hooks/useSign";

export const authenticationAdapter = createAuthenticationAdapter({
  getNonce: async () => {
    const response = await fetch("/api/auth/nonce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    const { data } = await response.json();
    return data.nonce;
  },

  createMessage: ({ nonce, address, chainId }) => {
    return createSiweMessage({
      domain: window.location.host,
      address,
      statement: `DeGov.AI wants you to sign in with your Ethereum account: ${address}`,
      uri: window.location.origin,
      version: "1",
      chainId,
      nonce,
    });
  },

  verify: async ({ message, signature }) => {
    const verifyRes = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, signature }),
      cache: "no-store",
    });
    const response = await verifyRes.json();

    if (response?.code === 0 && response?.data?.token) {
      setToken(response.data.token);
      return true;
    }

    return false;
  },

  signOut: async () => {
    clearToken();
  },
});
