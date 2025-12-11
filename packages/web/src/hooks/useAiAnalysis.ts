import { useState, useEffect, useCallback } from "react";

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
  const { enabled = true, chainId = 46 } = options;
  const daoConfig = useDaoConfig();

  const [data, setData] = useState<AiAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!proposalId || !enabled || !daoConfig?.aiAgent?.endpoint) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await getAiAnalysis(
        daoConfig.aiAgent.endpoint,
        proposalId,
        chainId
      );

      if (
        result.code === 0 &&
        result.data &&
        validateAiAnalysisData(result.data)
      ) {
        setData(result.data);
      } else {
        setError("No AI analysis data found for this proposal");
        setData(null);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch AI analysis";
      setError(errorMessage);
      setData(null);
      console.error("AI analysis fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [proposalId, enabled, chainId, daoConfig?.aiAgent?.endpoint]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch,
  };
}
