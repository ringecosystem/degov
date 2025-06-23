import { useState, useEffect, useCallback } from "react";

import type { AiAnalysisData } from "@/types/ai-analysis";
import {
  fetchAiAnalysisData,
  validateAiAnalysisData,
} from "@/utils/ai-analysis";

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

  const [data, setData] = useState<AiAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!proposalId || !enabled) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await fetchAiAnalysisData(proposalId, chainId);

      if (result && validateAiAnalysisData(result)) {
        setData(result);
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
  }, [proposalId, enabled, chainId]);

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
