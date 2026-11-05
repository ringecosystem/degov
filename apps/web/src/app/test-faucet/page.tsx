"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useState } from "react";
import { parseAbi } from "viem";
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";

import { TokenManagement } from "@/app/profile/_components/token-management";
import { Button } from "@/components/ui/button";
import { useDaoConfig } from "@/hooks/useDaoConfig";

const chainId = 1313161555;
const faucet = "0x015b051888776107000022746cc169ecd4e4bf4a";
const abi = parseAbi([
  "function claimed(address) view returns (bool)",
  "function claim()",
]);

export default function TestFaucet() {
  const config = useDaoConfig();
  const account = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient({ chainId });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [hash, setHash] = useState<`0x${string}`>();
  const claimed = useReadContract({
    address: faucet, abi, functionName: "claimed", chainId,
    args: account.address ? [account.address] : undefined,
    query: { enabled: !!account.address },
  });

  async function claim() {
    if (!account.address) { openConnectModal?.(); return; }
    setBusy(true);
    setMessage("");
    setHash(undefined);
    try {
      if (account.chainId !== chainId) await switchChainAsync({ chainId });
      if (!client) throw new Error("Aurora Testnet RPC unavailable. Try again.");
      const tx = await writeContractAsync({ address: faucet, abi, functionName: "claim", chainId });
      setHash(tx);
      setMessage("Waiting for confirmation…");
      const receipt = await client.waitForTransactionReceipt({ hash: tx, timeout: 300_000 });
      if (receipt.status !== "success" || receipt.to?.toLowerCase() !== faucet.toLowerCase()) throw new Error("Claim did not complete. Please try again.");
      setMessage("100 test KTON received. Open Manage tokens below to wrap them.");
      await claimed.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message.split("\n")[0] : "Claim failed. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-5 sm:p-8">
      <header className="space-y-3">
        <p className="text-sm text-muted-foreground">Aurora Testnet · Chain ID 1313161555</p>
        <h1 className="text-2xl font-semibold">Try KTON Wrap / Unwrap</h1>
        <p className="text-muted-foreground">Use your own wallet. These are test tokens with no monetary value. This preview tests token wrapping and delegation; proposal creation and voting are not configured.</p>
      </header>
      <section className="space-y-4 rounded-[14px] bg-card p-5">
        <h2 className="text-lg font-medium">1. Get test ETH for gas</h2>
        <p>Open the Aurora faucet, connect the same wallet and select Aurora Testnet. Complete its verification to receive test ETH, then return here.</p>
        <a className="inline-block underline" href="https://aurora.dev/faucet" target="_blank" rel="noreferrer">Open Aurora ETH faucet ↗</a>
      </section>
      <section className="space-y-4 rounded-[14px] bg-card p-5">
        <h2 className="text-lg font-medium">2. Claim 100 test KTON</h2>
        <p>One claim per wallet, while the faucet has tokens. Connect your wallet and confirm the claim transaction on Aurora Testnet.</p>
        {account.address && <p className="break-all text-sm text-muted-foreground">{account.address}</p>}
        <Button disabled={busy || (account.isConnected && (claimed.isPending || claimed.data === true))} onClick={() => void claim()}>
          {!account.isConnected ? "Connect wallet" : busy ? "Claiming…" : claimed.data ? "Already claimed" : "Claim 100 test KTON"}
        </Button>
        {claimed.isError && <p role="alert">Could not check claim status. <button className="underline" onClick={() => void claimed.refetch()}>Retry</button></p>}
        {message && <p role="status" className="break-words text-sm">{message}</p>}
        {hash && <a className="block break-all text-sm underline" href={`https://explorer.testnet.aurora.dev/tx/${hash}`} target="_blank" rel="noreferrer">View claim transaction ↗</a>}
      </section>
      <section className="space-y-4 rounded-[14px] bg-card p-5">
        <h2 className="text-lg font-medium">3. Wrap and unwrap</h2>
        <p>Open Manage tokens. Wrap KTON into gKTON with an approval followed by a wrap transaction. Unwrap converts gKTON back to KTON. You can also delegate your gKTON voting power.</p>
        {config && <TokenManagement key={`${account.address}-${claimed.data}-${message}`} config={config} />}
      </section>
    </main>
  );
}
