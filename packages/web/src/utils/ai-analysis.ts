import type { AiAnalysisResponse, AiAnalysisData } from "@/types/ai-analysis";

/**
 * Extract short proposal ID from full proposal ID (first 11 characters)
 * Example: 0xd405fa55165a239bc26d7324dee1a30e9baa5fc257ac16233ba20cd204a56909 -> 0xd405fa5
 */
export function getShortProposalId(fullProposalId: string): string {
  if (!fullProposalId || !fullProposalId.startsWith("0x")) {
    throw new Error("Invalid proposal ID format");
  }

  // Return first 11 characters (0x + 9 hex chars)
  return fullProposalId.substring(0, 11);
}

/**
 * Fetch AI analysis data from DeGov.AI API
 * API format: https://agent.degov.ai/degov/vote/{chainId}/{shortProposalId}?format=json
 */
export async function fetchAiAnalysisData(
  proposalId: string,
  chainId: number = 46
): Promise<AiAnalysisData | null> {
  try {
    const apiUrl = `https://agent.degov.ai/degov/vote/${chainId}/${proposalId}?format=json`;

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
        `API request failed: ${response.status} ${response.statusText}`
      );
    }

    const data: AiAnalysisResponse = await response.json();

    if (data.code === 0 && data.data) {
      return data.data;
    }

    return null;
  } catch (error) {
    console.error("Error fetching AI analysis data:", error);
    throw error; // Re-throw to allow component to handle the error
  }
}

/**
 * Process raw AI analysis data for display
 */
export function processAiAnalysisData(data: AiAnalysisData) {
  const output = data.fulfilled_explain.output;
  const input = data.fulfilled_explain.input;

  // Calculate total votes for Twitter poll
  const totalTwitterPollVotes = input.pollOptions.reduce(
    (sum, option) => sum + option.votes,
    0
  );

  // Get individual poll option votes
  const forVotes = input.pollOptions.find((o) => o.label === "For")?.votes || 0;
  const againstVotes =
    input.pollOptions.find((o) => o.label === "Against")?.votes || 0;
  const abstainVotes =
    input.pollOptions.find((o) => o.label === "Abstain")?.votes || 0;

  // Calculate percentages for on-chain votes
  const totalOnChainVotes =
    output.votingBreakdown.onChainVotes.for +
    output.votingBreakdown.onChainVotes.against +
    output.votingBreakdown.onChainVotes.abstain;

  const onChainPercentages = {
    for:
      totalOnChainVotes > 0
        ? (output.votingBreakdown.onChainVotes.for / totalOnChainVotes) * 100
        : 0,
    against:
      totalOnChainVotes > 0
        ? (output.votingBreakdown.onChainVotes.against / totalOnChainVotes) *
          100
        : 0,
    abstain:
      totalOnChainVotes > 0
        ? (output.votingBreakdown.onChainVotes.abstain / totalOnChainVotes) *
          100
        : 0,
  };

  return {
    ...data,
    processed: {
      twitterPoll: {
        totalVotes: totalTwitterPollVotes,
        votes: { for: forVotes, against: againstVotes, abstain: abstainVotes },
        percentages: output.votingBreakdown.twitterPoll,
      },
      onChainVotes: {
        totalVotes: totalOnChainVotes,
        votes: output.votingBreakdown.onChainVotes,
        percentages: onChainPercentages,
      },
      twitterComments: output.votingBreakdown.twitterComments,
      finalDecision: {
        result: output.finalResult,
        confidence: output.confidence,
        reasoning: output.reasoning,
        reasoningLite: output.reasoningLite,
      },
    },
  };
}

/**
 * Format vote counts for display (1000 -> 1K, 1000000 -> 1M)
 */
export function formatVoteCount(votes: number): string {
  if (votes >= 1000000) {
    return `${(votes / 1000000).toFixed(2)}M`;
  } else if (votes >= 1000) {
    return `${(votes / 1000).toFixed(1)}K`;
  }
  return votes.toString();
}

/**
 * Get vote type from AI analysis result
 */
export function getVoteTypeFromResult(
  result: string
): "for" | "against" | "abstain" {
  switch (result.toLowerCase()) {
    case "for":
      return "for";
    case "against":
      return "against";
    case "abstain":
      return "abstain";
    default:
      return "abstain";
  }
}

/**
 * Extract proposal title from description if it contains markdown
 */
export function extractProposalTitle(description?: string): string {
  if (!description) return "Untitled Proposal";

  // Try to extract title from markdown header
  const titleMatch = description.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  // Fallback to first line if no markdown header
  const firstLine = description.split("\n")[0];
  return firstLine.length > 80 ? `${firstLine.substring(0, 77)}...` : firstLine;
}

/**
 * Validate AI analysis data structure
 */
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
