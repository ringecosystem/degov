import { useQuery } from "@tanstack/react-query";

import { getAiAnalysis } from "@/services/ai-agent";
import type { AiAnalysisData } from "@/types/ai-analysis";
import { validateAiAnalysisData } from "@/utils/ai-analysis";

import { useDaoConfig } from "./useDaoConfig";

interface UseAiAnalysisState {
  data: AiAnalysisData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseAiAnalysisOptions {
  enabled?: boolean;
  chainId?: number;
}

/**
 * Custom hook to fetch and manage AI analysis data
 */
export function useAiAnalysis(
  proposalId: string | null,
  options: UseAiAnalysisOptions = {}
): UseAiAnalysisState {
  const { enabled = true, chainId } = options;
  const daoConfig = useDaoConfig();
  const resolvedChainId = chainId ?? daoConfig?.chain?.id;

  const query = useQuery({
    queryKey: [
      "ai-analysis",
      proposalId,
      daoConfig?.aiAgent?.endpoint,
      resolvedChainId,
    ],
    enabled:
      enabled && !!proposalId && !!daoConfig?.aiAgent?.endpoint && !!resolvedChainId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!proposalId || !daoConfig?.aiAgent?.endpoint) {
        throw new Error("AI analysis endpoint or proposalId is missing");
      }

      const result = await getAiAnalysis(
        daoConfig.aiAgent.endpoint,
        proposalId,
        Number(resolvedChainId)
      );

      if (
        result.code === 0 &&
        result.data &&
        validateAiAnalysisData(result.data)
      ) {
        return result.data;
      }

      throw new Error("No AI analysis data found for this proposal");
    },
  });

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: async () => {
      await query.refetch();
    },
  };
}
