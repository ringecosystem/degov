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
  endpoint?: string;
}

/**
 * Custom hook to fetch and manage AI analysis data.
 * The `endpoint` option must be provided (and `enabled` must be true) for the
 * query to run; omitting `endpoint` keeps the query disabled.
 */
export function useAiAnalysis(
  proposalId: string | null,
  options: UseAiAnalysisOptions = {}
): UseAiAnalysisState {
  const { enabled = true, chainId, endpoint } = options;
  const daoConfig = useDaoConfig();
  const resolvedChainId = chainId ?? daoConfig?.chain?.id;

  const query = useQuery({
    queryKey: [
      "ai-analysis",
      proposalId,
      endpoint,
      resolvedChainId,
    ],
    enabled:
      enabled &&
      !!proposalId &&
      !!endpoint &&
      !!resolvedChainId,
    retry: 2,
    queryFn: async () => {
      if (!proposalId || !endpoint) {
        throw new Error("AI analysis endpoint or proposalId is missing");
      }

      const result = await getAiAnalysis(
        endpoint,
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
