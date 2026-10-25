"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount, useWriteContract } from "wagmi";

import useCastVote from "@/hooks/useCastVote";
import { degovRestApi } from "@/utils/remote-api";

type SignatureRequest = {
  id: string;
  type: string;
  address: string;
  daoCode: string;
  chain: string;
  contract: string;
  function: string;
  args: string[];
  summary: string;
  safe?: string;
  target?: string;
  amount?: string;
  calldata?: string;
  used: boolean;
  txHash?: string;
  failure?: string;
};

export function McpSignClient() {
  const params = useSearchParams();
  const requestId = params.get("request") ?? "";
  const { address, isConnected } = useAccount();
  const { castVote, isPending } = useCastVote();
  const { writeContractAsync } = useWriteContract();
  const [request, setRequest] = useState<SignatureRequest | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const api = degovRestApi();
    if (!api || !requestId) return;
    void fetch(`${api}/mcp/signature-requests/${requestId}`)
      .then(async (response) => {
        if (!response.ok) {
          setMessage(await response.text());
          return;
        }
        setRequest((await response.json()) as SignatureRequest);
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "Unable to load the signature request.");
      });
  }, [requestId]);

  async function submit() {
    if (!request || request.used) return;
    if (!address || address.toLowerCase() !== request.address.toLowerCase()) {
      setMessage("Connected address must equal the linked address.");
      return;
    }
    const api = degovRestApi();
    if (!api) return;
    try {
      const hash =
        request.type === "vote"
          ? await castVote({
              proposalId: BigInt(request.args[0] ?? "0"),
              support: Number(request.args[1] ?? "0"),
              reason: request.args[2] ?? "",
            })
          : await writeContractAsync({
              address: request.contract as `0x${string}`,
              abi: [
                {
                  type: "function",
                  name: request.function,
                  stateMutability: "payable",
                  inputs: request.args.map((_, index) => ({
                    name: `arg${index}`,
                    type: "string",
                  })),
                  outputs: [],
                },
              ],
              functionName: request.function,
              args: request.args,
            });
      await fetch(`${api}/mcp/signature-requests/${request.id}/result`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(hash ? { txHash: hash } : { failure: "wallet_rejected" }),
      });
      setMessage(hash ? `Submitted ${hash}` : "The wallet did not return a transaction hash.");
    } catch (error) {
      const failure = error instanceof Error ? error.message : "transaction_failed";
      await fetch(`${degovRestApi()}/mcp/signature-requests/${request.id}/result`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ failure }),
      });
      setMessage(failure);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Sign</h1>
      <ConnectButton />
      {request ? (
        <section className="flex flex-col gap-2">
          <p>{request.summary}</p>
          <p>DAO {request.daoCode}</p>
          <p>Chain {request.chain}</p>
          <p>Contract {request.contract}</p>
          <p>Function {request.function}</p>
          {request.safe ? <p>Safe {request.safe}</p> : null}
          {request.target ? <p>Target {request.target}</p> : null}
          {request.amount ? <p>Amount {request.amount}</p> : null}
          {request.calldata ? <p>Calldata {request.calldata}</p> : null}
          <button
            type="button"
            className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50"
            disabled={!isConnected || request.used || isPending}
            onClick={() => {
              void submit();
            }}
          >
            Submit
          </button>
        </section>
      ) : null}
      {message ? <p>{message}</p> : null}
    </main>
  );
}
