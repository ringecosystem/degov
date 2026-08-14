import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { calculateDescriptionHash } from "@/hooks/useProposal";
import type { ProposalItem } from "@/services/graphql/types";
import {
  getProposalSimulationCapability,
  simulateProposal,
  type ProposalSimulationResult,
} from "@/services/proposal-simulation";

const XACCOUNT_SIGNATURE =
  "send(uint256 toChainId, address toDapp, bytes calldata message, bytes calldata params) external payable";

export function useProposalSimulation({
  daoCode,
  proposal,
  caller,
  canExecute,
}: {
  daoCode?: string;
  proposal?: ProposalItem & { originalDescription: string };
  caller?: string;
  canExecute: boolean;
}) {
  const [result, setResult] = useState<ProposalSimulationResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const payload = useMemo(() => {
    if (!proposal || !caller) return undefined;

    return {
      caller,
      targets: proposal.targets,
      values: proposal.values.map((value) => String(value)),
      calldatas: proposal.calldatas,
      descriptionHash: calculateDescriptionHash(proposal.originalDescription),
    };
  }, [caller, proposal]);

  const resultKey = JSON.stringify({
    canExecute,
    caller,
    proposalId: proposal?.proposalId,
    payload,
  });
  const currentResultKey = useRef(resultKey);

  const capability = useQuery({
    queryKey: ["proposalSimulationCapability", daoCode],
    queryFn: () => getProposalSimulationCapability(daoCode as string),
    enabled: Boolean(daoCode && caller && canExecute),
    staleTime: 5 * 60 * 1000,
  });

  const {
    error,
    isPending,
    mutate,
    reset,
  } = useMutation({
    mutationFn: async (requestKey: string) => {
      if (requestKey !== currentResultKey.current) {
        throw new Error("Simulation request is stale");
      }
      if (!daoCode || !proposal?.proposalId || !payload) {
        throw new Error("Simulation is not ready");
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      return simulateProposal({
        daoCode,
        proposalId: proposal.proposalId,
        payload,
        signal: controller.signal,
      });
    },
    onSuccess: (nextResult, requestKey) => {
      if (requestKey === currentResultKey.current) setResult(nextResult);
    },
  });

  useEffect(() => {
    currentResultKey.current = resultKey;
    abortRef.current?.abort();
    setResult(null);
    reset();
    return () => abortRef.current?.abort();
  }, [reset, resultKey]);

  useEffect(() => {
    if (!result) return;
    const timeout = window.setTimeout(() => setResult(null), 15_000);
    return () => window.clearTimeout(timeout);
  }, [result]);

  return {
    capability: capability.data,
    canSimulate:
      canExecute && Boolean(caller) && capability.data?.enabled === true,
    isSimulating: isPending,
    simulate: () => mutate(resultKey),
    error,
    result,
    hasXAccountAction:
      proposal?.signatureContent?.some(
        (signature) => signature === XACCOUNT_SIGNATURE
      ) ?? false,
  };
}
