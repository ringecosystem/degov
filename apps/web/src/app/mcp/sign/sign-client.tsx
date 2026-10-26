"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount, useWriteContract } from "wagmi";

import { abi as GovernorAbi } from "@/config/abi/governor";
import useCancelProposal from "@/hooks/useCancelProposal";
import useCastVote from "@/hooks/useCastVote";
import { useDelegate } from "@/hooks/useDelegate";
import useExecuteProposal from "@/hooks/useExecute";
import useQueueProposal from "@/hooks/useQueue";
import { degovRestApi } from "@/utils/remote-api";

const safeExecAbi = [
  {
    type: "function",
    name: "execTransaction",
    stateMutability: "payable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
      { name: "safeTxGas", type: "uint256" },
      { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" },
      { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" },
      { name: "signatures", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

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
  targets?: string[];
  values?: string[];
  calldatas?: string[];
  description?: string;
  used: boolean;
  txHash?: string;
  failure?: string;
};

export function McpSignClient() {
  const params = useSearchParams();
  const requestId = params.get("request") ?? "";
  const { address, isConnected } = useAccount();
  const { castVote, isPending } = useCastVote();
  const { queueProposal } = useQueueProposal();
  const { executeProposal } = useExecuteProposal();
  const { cancelProposal } = useCancelProposal();
  const { delegate } = useDelegate();
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
      const chainId = Number(request.chain);
      const action = {
        targets: (request.targets ?? []) as `0x${string}`[],
        values: (request.values ?? []).map((value) => BigInt(value)),
        calldatas: (request.calldatas ?? []) as `0x${string}`[],
        description: request.description ?? "",
        governor: request.contract as `0x${string}`,
        chainId,
      };
      if (
        request.type !== "vote" &&
        request.type !== "queue" &&
        request.type !== "execute" &&
        request.type !== "cancel" &&
        request.type !== "delegate" &&
        request.function !== "propose" &&
        request.function !== "execTransaction"
      ) {
        setMessage("unsupported_function");
        return;
      }
      const hash =
        request.type === "vote"
          ? await castVote({
              proposalId: BigInt(request.args[0] ?? "0"),
              support: Number(request.args[1] ?? "0"),
              reason: request.args[2] ?? "",
              governor: request.contract as `0x${string}`,
              chainId,
            })
          : request.type === "queue"
            ? await queueProposal(action)
            : request.type === "execute"
              ? await executeProposal(action)
              : request.type === "cancel"
                ? await cancelProposal(action)
                : request.type === "delegate"
                  ? await delegate((request.args[0] ?? "0x0000000000000000000000000000000000000000") as `0x${string}`, {
                      token: request.contract as `0x${string}`,
                      chainId,
                    })
          : request.function === "propose"
            ? await writeContractAsync({
                address: request.contract as `0x${string}`,
                abi: GovernorAbi,
                functionName: "propose",
                chainId,
                args: [
                  (request.targets ?? []) as `0x${string}`[],
                  (request.values ?? []).map((value) => BigInt(value)),
                  (request.calldatas ?? []) as `0x${string}`[],
                  request.description ?? "",
                ],
              })
            : await writeContractAsync({
                address: (request.safe || request.contract) as `0x${string}`,
                abi: safeExecAbi,
                functionName: "execTransaction",
                chainId,
                args: [
                  (request.target ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
                  BigInt(request.amount || "0"),
                  (request.calldata ?? "0x") as `0x${string}`,
                  0,
                  BigInt(0),
                  BigInt(0),
                  BigInt(0),
                  "0x0000000000000000000000000000000000000000",
                  "0x0000000000000000000000000000000000000000",
                  "0x",
                ],
              });
      if (!hash) return;
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
          <p>Safe {request.safe ?? ""}</p>
          <p>Target {request.target ?? ""}</p>
          <p>Amount {request.amount ?? ""}</p>
          <p>Calldata {request.calldata ?? ""}</p>
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
