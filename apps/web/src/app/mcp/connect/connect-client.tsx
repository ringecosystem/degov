"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { createSiweMessage } from "viem/siwe";
import { useAccount, useSignMessage } from "wagmi";

import { degovRestApi } from "@/utils/remote-api";

export function McpConnectClient() {
  const params = useSearchParams();
  const state = params.get("state") ?? "";
  const { address, isConnected, chainId } = useAccount();
  const { signMessageAsync, isPending } = useSignMessage();
  const [message, setMessage] = useState("");

  async function linkWallet() {
    if (!address || !state) {
      setMessage("Open this page from the wallet link URL.");
      return;
    }
    const siwe = createSiweMessage({
      address,
      chainId: chainId ?? 1,
      domain: "degov.ai",
      nonce: state,
      uri: "https://degov.ai",
      version: "1",
      statement: "DeGov.AI wants you to sign in with your Ethereum account",
      expirationTime: new Date(Date.now() + 10 * 60 * 1000),
    });
    const signature = await signMessageAsync({ message: siwe });
    const api = degovRestApi();
    if (!api) {
      setMessage("DeGov API is not configured.");
      return;
    }
    const response = await fetch(`${api}/mcp/wallet-link/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state, message: siwe, signature }),
    });
    if (!response.ok) {
      setMessage(await response.text());
      return;
    }
    setMessage("Wallet linked. Return to the conversation.");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Connect wallet</h1>
      <p>Sign in with the wallet that should own DeGov drafts and votes. This page does not browse a DAO.</p>
      <ConnectButton />
      <button
        type="button"
        className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50"
        disabled={!isConnected || !state || isPending}
        onClick={() => {
          void linkWallet();
        }}
      >
        Sign in
      </button>
      {message ? <p>{message}</p> : null}
    </main>
  );
}
