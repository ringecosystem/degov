"use client";

import { useQueryClient } from "@tanstack/react-query";
import { getAccount } from "@wagmi/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAddress, zeroAddress } from "viem";
import { useAccount, useConfig, usePublicClient, useReadContracts, useWriteContract } from "wagmi";

import { tokenWrapperAbi as abi } from "@/config/abi/token-wrapper";
import { confirmWrapperTransaction, getTokenWrapper, readWrapperValues } from "@/lib/token-wrapper";
import type { WrapperAction } from "@/lib/token-wrapper";
import type { Config } from "@/types/config";

import type { Address, Hash } from "viem";

export function useTokenWrapper(dao: Config) {
  const wrapper = useMemo(() => getTokenWrapper(dao), [dao]);
  const { address: account, chainId: walletChain } = useAccount();
  const wagmiConfig = useConfig();
  const client = usePublicClient({ chainId: wrapper?.chainId });
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<"idle" | "signing" | "confirming">("idle");
  const [hash, setHash] = useState<Hash>();
  const [completed, setCompleted] = useState<WrapperAction>();
  const [error, setError] = useState<string>();
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const reads = useReadContracts({
    allowFailure: false,
    contracts: wrapper && account ? [
      { address: wrapper.address, abi, functionName: "underlying", chainId: wrapper.chainId },
      { address: wrapper.governor, abi, functionName: "token", chainId: wrapper.chainId },
      { address: wrapper.underlying, abi, functionName: "symbol", chainId: wrapper.chainId },
      { address: wrapper.address, abi, functionName: "symbol", chainId: wrapper.chainId },
      { address: wrapper.underlying, abi, functionName: "decimals", chainId: wrapper.chainId },
      { address: wrapper.address, abi, functionName: "decimals", chainId: wrapper.chainId },
      { address: wrapper.underlying, abi, functionName: "balanceOf", args: [account], chainId: wrapper.chainId },
      { address: wrapper.address, abi, functionName: "balanceOf", args: [account], chainId: wrapper.chainId },
      { address: wrapper.underlying, abi, functionName: "allowance", args: [account, wrapper.address], chainId: wrapper.chainId },
      { address: wrapper.address, abi, functionName: "delegates", args: [account], chainId: wrapper.chainId },
      { address: wrapper.address, abi, functionName: "getVotes", args: [account], chainId: wrapper.chainId },
    ] : [],
    query: { enabled: Boolean(wrapper && account), refetchInterval: 15_000 },
  });

  const data = reads.data;
  const values = readWrapperValues(data, wrapper);
  const matches = Boolean(values);

  function assertContext() {
    const current = getAccount(wagmiConfig);
    if (!wrapper || !account || !current.isConnected ||
      current.address?.toLowerCase() !== account.toLowerCase() ||
      current.chainId !== wrapper.chainId || !mounted.current) {
      throw new Error("Wallet changed. Reopen token management and try again.");
    }
  }

  const call = useCallback((action: WrapperAction, amount: bigint, delegatee?: Address) => {
    if (!wrapper || !account) throw new Error("Wrapper is not configured");
    const base = { abi, account, chain: client?.chain };
    if (action === "approve") return { ...base, address: wrapper.underlying, functionName: "approve" as const, args: [wrapper.address, amount] as const };
    if (action === "wrap") return { ...base, address: wrapper.address, functionName: "depositFor" as const, args: [account, amount] as const };
    if (action === "unwrap") return { ...base, address: wrapper.address, functionName: "withdrawTo" as const, args: [account, amount] as const };
    if (!delegatee || !isAddress(delegatee) || delegatee.toLowerCase() === zeroAddress) throw new Error("Invalid delegate address");
    return { ...base, address: wrapper.address, functionName: "delegate" as const, args: [delegatee] as const };
  }, [wrapper, account, client?.chain]);

  async function execute(action: WrapperAction, amount: bigint, delegatee?: Address) {
    if (running.current || !client || !values || !wrapper) return;
    running.current = true;
    setError(undefined);
    if (action !== "delegate") setCompleted(undefined);
    setHash(undefined);
    setPhase("signing");
    try {
      assertContext();
      // Re-read before signing; cached balances and allowance may have changed.
      const fresh = await reads.refetch();
      const freshValues = readWrapperValues(fresh.data, wrapper);
      if (fresh.error || !freshValues) {
        throw new Error("Unable to verify token contracts. Refresh and try again.");
      }
      if (action !== "delegate") {
        const balance = action === "unwrap" ? freshValues.balance : freshValues.underlyingBalance;
        if (amount <= 0n || amount > balance) throw new Error("Invalid amount or insufficient token balance");
        if (action === "wrap" && freshValues.allowance < amount) throw new Error("Token approval is required");
      }
      const request = call(action, amount, delegatee);
      await confirmWrapperTransaction({
        assertContext,
        simulate: async () => {
          if (request.functionName === "delegate") await client.simulateContract(request);
          else await client.simulateContract(request);
        },
        write: () => writeContractAsync({ ...request, chainId: wrapper.chainId }),
        wait: (tx, onReplaced) => client.waitForTransactionReceipt({ hash: tx, onReplaced }),
        onSubmitted: (tx) => {
          if (mounted.current) { setHash(tx); setPhase("confirming"); }
        },
      });
      if (mounted.current) {
        // Refresh directly after confirmation, independently of toast dismissal.
        await reads.refetch();
        void queryClient.invalidateQueries({ queryKey: ["readContract"] });
        void queryClient.invalidateQueries({ queryKey: ["readContracts"] });
        void queryClient.invalidateQueries({ queryKey: ["delegateMappings", account, dao.indexer.endpoint] });
        setCompleted(action);
      }
    } catch (cause) {
      if (mounted.current) setError((cause as { shortMessage?: string; message?: string }).shortMessage || (cause as Error).message);
    } finally {
      running.current = false;
      if (mounted.current) setPhase("idle");
    }
  }

  const estimate = useCallback(async (action: WrapperAction, amount: bigint) => {
    if (!client || !matches || !wrapper || !account || walletChain !== wrapper.chainId) return undefined;
    const request = call(action, amount);
    const [gas, price] = await Promise.all([
      request.functionName === "delegate" ? client.estimateContractGas(request) : client.estimateContractGas(request),
      client.getGasPrice(),
    ]);
    return gas * price;
  }, [client, matches, wrapper, account, walletChain, call]);

  return {
    values, execute, estimate, phase, hash, completed, error,
    isLoading: reads.isLoading,
    unavailable: Boolean(reads.error || (data && !matches)),
    refresh: () => reads.refetch(),
    clear: () => { setCompleted(undefined); setError(undefined); setHash(undefined); },
  };
}
