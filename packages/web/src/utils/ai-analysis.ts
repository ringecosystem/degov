import type { AiAnalysisData } from "@/types/ai-analysis";

export function validateAiAnalysisData(data: AiAnalysisData): boolean {
  return (
    data &&
    typeof data.id === "string" &&
    typeof data.proposal_id === "string" &&
    data.fulfilled_explain &&
    data.fulfilled_explain.output &&
    data.fulfilled_explain.input &&
    Array.isArray(data.fulfilled_explain.input.pollOptions) &&
    data.dao &&
    typeof data.dao.name === "string"
  );
}
