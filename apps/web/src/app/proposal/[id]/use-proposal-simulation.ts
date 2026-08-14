import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

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
    mutationFn: async () => {
      if (!daoCode || !proposal?.proposalId || !payload) {
        throw new Error("Simulation is not ready");
      }
      return simulateProposal({
        daoCode,
        proposalId: proposal.proposalId,
        payload,
      });
    },
    onSuccess: setResult,
  });

  useEffect(() => {
    setResult(null);
    reset();
  }, [reset, resultKey]);

  return {
    capability: capability.data,
    canSimulate:
      canExecute && Boolean(caller) && capability.data?.enabled === true,
    isSimulating: isPending,
    simulate: mutate,
    error,
    result,
    hasXAccountAction:
      proposal?.signatureContent?.some(
        (signature) => signature === XACCOUNT_SIGNATURE
      ) ?? false,
  };
}
