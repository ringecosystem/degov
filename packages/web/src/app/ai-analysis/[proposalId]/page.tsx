"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useReadContract } from "wagmi";

import { abi as GovernorAbi } from "@/config/abi/governor";
import { useAiAnalysis } from "@/hooks/useAiAnalysis";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { proposalService } from "@/services/graphql";
import { ProposalState } from "@/types/proposal";
import { parseDescription } from "@/utils/helpers";

import { AiAnalysisStandalone } from "./ai-analysis-standalone";

// Force static generation for this dynamic route
export const dynamic = "force-static";

export default function AiAnalysisPage({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const [proposalId, setProposalId] = useState<string>("");
  const daoConfig = useDaoConfig();

  useEffect(() => {
    const loadParams = async () => {
      const resolvedParams = await params;
      setProposalId(resolvedParams.proposalId);
    };
    loadParams();
  }, [params]);

  // Get proposal status from contract
  const { data: proposalStatus } = useReadContract({
    address: daoConfig?.contracts?.governor as `0x${string}`,
    abi: GovernorAbi,
    functionName: "state",
    args: [proposalId ? BigInt(proposalId as string) : 0n],
    chainId: daoConfig?.chain?.id,
    query: {
      enabled:
        !!proposalId &&
        !!daoConfig?.contracts?.governor &&
        !!daoConfig?.chain?.id,
    },
  });

  // Query to get proposal data from indexer
  const {
    data: proposalData,
    isLoading: isProposalLoading,
    error: proposalError,
    refetch: refetchProposal,
  } = useQuery({
    queryKey: ["proposal", proposalId, daoConfig?.indexer?.endpoint],
    queryFn: async () => {
      if (!proposalId || !daoConfig?.indexer?.endpoint) return null;

      const proposals = await proposalService.getAllProposals(
        daoConfig.indexer.endpoint,
        {
          where: {
            proposalId_eq: proposalId,
          },
        }
      );

      if (proposals && proposals.length > 0) {
        const proposal = proposals[0];
        const parsedDescription = parseDescription(proposal.description);

        return {
          proposalId: proposal.proposalId,
          title: parsedDescription.mainText || `Proposal ${proposalId}`,
          description: parsedDescription.mainText || proposal.description,
          proposer: proposal.proposer,
          blockTimestamp: proposal.blockTimestamp,
          status: (proposalStatus as ProposalState) || ProposalState.Active,
          chainId: daoConfig?.chain?.id || 46,
        };
      }

      return null;
    },
    enabled: !!proposalId && !!daoConfig?.indexer?.endpoint,
  });

  // Query to get AI analysis data (API deprecated, disabled for now)
  const {
    data: aiAnalysisData,
    loading: isAiAnalysisLoading,
    error: aiAnalysisError,
    refetch: refetchAiAnalysis,
  } = useAiAnalysis(proposalId, {
    enabled: false, // TODO: Re-enable when new API is ready
    chainId: daoConfig?.chain?.id || 46,
  });

  const handleRefresh = () => {
    refetchProposal();
    refetchAiAnalysis();
  };

  const isLoading = isProposalLoading || isAiAnalysisLoading;
  const error = proposalError?.message || aiAnalysisError;

  if (!proposalId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading AI analysis...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-foreground text-background rounded-lg hover:bg-foreground/90 cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!proposalData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-text-secondary">No proposal data found</p>
          <button
            onClick={handleRefresh}
            className="mt-4 px-4 py-2 bg-foreground text-background rounded-lg hover:bg-foreground/90 cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <AiAnalysisStandalone
      proposalData={proposalData}
      analysisData={aiAnalysisData}
      loading={false}
      error={null}
      onRefresh={handleRefresh}
    />
  );
}
