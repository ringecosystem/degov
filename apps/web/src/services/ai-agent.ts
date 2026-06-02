import type { AiAnalysisData, AiAnalysisResponse } from "@/types/ai-analysis";

/**
 * Fetch AI analysis data from DeGov.AI API
 * API format: {endpoint}/degov/vote/{chainId}/{shortProposalId}?format=json
 */
export const getAiAnalysis = async (
  endpoint: string,
  proposalId: string,
  chainId: number
): Promise<{ code: number; data: AiAnalysisData | null }> => {
  try {
    const apiUrl = `${endpoint}/degov/vote/${chainId}/${proposalId}?format=json`;

    console.log(`Fetching AI analysis from: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `AI analysis API request failed: ${response.status} ${response.statusText}`
      );
    }

    const data: AiAnalysisResponse = await response.json();

    if (data.code === 0 && data.data) {
      return { code: data.code, data: data.data };
    }

    return { code: data.code || -1, data: null };
  } catch (error) {
    console.error("Error fetching AI analysis data:", error);
    throw error;
  }
};
