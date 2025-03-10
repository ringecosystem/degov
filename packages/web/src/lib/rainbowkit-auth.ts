"use client";
import { createAuthenticationAdapter } from "@rainbow-me/rainbowkit";
import { createSiweMessage } from "viem/siwe";

export const authenticationAdapter = createAuthenticationAdapter({
  getNonce: async () => {
    const response = await fetch("/api/auth/nonce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    });
    const response = await verifyRes.json();

    console.log("response", response);

    if (response?.code === 0 && response?.data) {
      localStorage.setItem("token", response.data);
      return true;
    }

    return false;
  },

  signOut: async () => {
    localStorage.removeItem("token");
  },
});
