import { useQuery } from "@tanstack/react-query";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useReadContracts } from "wagmi";

import { abi as GovernorAbi } from "@/config/abi/governor";
import { useConfig as useDaoConfig } from "@/hooks/useConfig";
import { proposalService } from "@/services/graphql";
import type { ProposalItem } from "@/services/graphql/types";
import type { ProposalState as ProposalStatus } from "@/types/proposal";

import type { Address } from "viem";
export type ProposalVotes = {
  againstVotes: bigint;
  forVotes: bigint;
  abstainVotes: bigint;
};

export function useProposalData(address?: Address, support?: "1" | "2" | "3") {
  const daoConfig = useDaoConfig();
  const [currentPage, setCurrentPage] = useState(1);
  const [allProposals, setAllProposals] = useState<ProposalItem[]>([]);

  const queryKey = useMemo(
    () => [
      "proposals",
      daoConfig?.indexer?.endpoint,
      currentPage,
      address,
      support,
    ],
    [daoConfig?.indexer?.endpoint, currentPage, address, support]
  );

  const { refetch, ...proposalsQuery } = useQuery({
    queryKey,
    queryFn: async () => {
      const whereCondition = address
        ? {
            proposer_eq: address?.toLowerCase(),
            voters_every: {
              voter_eq: address?.toLowerCase(),
              support_eq: support ? parseInt(support) : undefined,
            },
          }
        : undefined;

      const result = await proposalService.getAllProposals(
        daoConfig?.indexer?.endpoint as string,
        {
          limit: 10,
          offset: (currentPage - 1) * 10,
          orderBy: "blockTimestamp_DESC_NULLS_LAST",
          where: whereCondition,
        }
      );

      if (Array.isArray(result)) {
        setAllProposals((prev) => {
          if (currentPage === 1) return result;

          const existingIds = new Set(prev.map((p) => p.id));
          const newProposals = result.filter((p) => !existingIds.has(p.id));
          return [...prev, ...newProposals];
        });
        return result;
      }
      return [];
    },
    retryDelay: 10_000,
    retry: 3,
  });

  const voteContracts = useMemo(() => {
    const proposalVotesContract = {
      address: daoConfig?.contracts?.governor as `0x${string}`,
      abi: GovernorAbi,
      functionName: "proposalVotes",
      chainId: daoConfig?.network?.chainId,
    } as const;
    return allProposals?.map((item) => ({
      ...proposalVotesContract,
      args: [item.proposalId],
    }));
  }, [
    allProposals,
    daoConfig?.contracts?.governor,
    daoConfig?.network?.chainId,
  ]);

  const {
    data: proposalVotes,
    isFetching: proposalVotesLoading,
    error: proposalVotesError,
  } = useReadContracts({
    contracts: voteContracts,
    query: {
      enabled: allProposals.length > 0 && !!daoConfig?.network?.chainId,
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  });

  const statusContracts = useMemo(() => {
    const proposalStatusContract = {
      address: daoConfig?.contracts?.governor as `0x${string}`,
      abi: GovernorAbi,
      functionName: "state",
      chainId: daoConfig?.network?.chainId,
    } as const;
    return allProposals.map((item) => ({
      ...proposalStatusContract,
      args: [item.proposalId],
    }));
  }, [
    allProposals,
    daoConfig?.contracts?.governor,
    daoConfig?.network?.chainId,
  ]);

  const {
    data: proposalStatuses,
    isFetching: proposalStatusesLoading,
    error: proposalStatusesError,
  } = useReadContracts({
    contracts: statusContracts,
    query: {
      enabled: allProposals.length > 0 && !!daoConfig?.network?.chainId,
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  });

  const formattedVotes = useMemo(
    () =>
      allProposals.reduce((acc, proposal, index) => {
        if (proposalVotes?.[index]?.result) {
          acc[proposal.id] = {
            againstVotes: proposalVotes?.[index].result?.[0] ?? BigInt(0),
            forVotes: proposalVotes?.[index].result?.[1] ?? BigInt(0),
            abstainVotes: proposalVotes?.[index].result?.[2] ?? BigInt(0),
          };
        }
        return acc;
      }, {} as Record<string, ProposalVotes>),
    [allProposals, proposalVotes]
  );

  const formattedStatuses = useMemo(
    () =>
      proposalStatuses
        ? allProposals.reduce((acc, proposal, index) => {
            if (proposalStatuses[index]?.status === "success") {
              acc[proposal.id] = proposalStatuses[index]
                .result as ProposalStatus;
            }
            return acc;
          }, {} as Record<string, ProposalStatus>)
        : {},
    [allProposals, proposalStatuses]
  );

  const loadMoreData = useCallback(() => {
    if (!proposalsQuery.isLoading && proposalsQuery.data?.length === 10) {
      setCurrentPage((prev) => prev + 1);
    }
  }, [proposalsQuery.isLoading, proposalsQuery.data?.length]);

  const refreshData = useCallback(() => {
    setCurrentPage(1);
    setAllProposals([]);
    refetch();
  }, [refetch]);

  const loadInitialData = useCallback(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
      setAllProposals([]);
    } else {
      refetch();
    }
  }, [currentPage, refetch]);

  useEffect(() => {
    return () => {
      setAllProposals([]);
      setCurrentPage(1);
    };
  }, []);

  return {
    state: {
      data: allProposals,
      currentPage,
      hasMore: proposalsQuery.data?.length === 10,
      isFetching: proposalsQuery.isFetching,
      error: proposalsQuery.error,
    },
    proposalVotesState: {
      data: formattedVotes,
      isFetching: proposalVotesLoading,
      error: proposalVotesError,
    },
    proposalStatusState: {
      data: formattedStatuses,
      isFetching: proposalStatusesLoading,
      error: proposalStatusesError,
    },
    loadMoreData,
    refreshData,
    loadInitialData,
  };
}
