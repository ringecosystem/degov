import DOMPurify from "dompurify";
import { X } from "lucide-react";
import { marked } from "marked";
import Image from "next/image";
import React, { useMemo } from "react";

import { AddressWithAvatar } from "@/components/address-with-avatar";
import { AiLogo } from "@/components/icons/ai-logo";
import { AiTitleIcon as AiTitleIcon1 } from "@/components/icons/ai-title-icon-1";
import { AiTitleIcon as AiTitleIcon2 } from "@/components/icons/ai-title-icon-2";
import { AiTitleIcon as AiTitleIcon3 } from "@/components/icons/ai-title-icon-3";
import { ProposalStatus } from "@/components/proposal-status";
import { LoadingState, ErrorState } from "@/components/ui/loading-spinner";
import { VoteStatusAction } from "@/components/vote-status";
import { VoteType } from "@/config/vote";
import type { AiAnalysisData } from "@/types/ai-analysis";
import { ProposalState } from "@/types/proposal";
import { extractTitleAndDescription } from "@/utils";
import { formatTimestampToFriendlyDate } from "@/utils/date";

interface ProposalData {
  proposalId: string;
  title: string;
  description: string;
  proposer: string;
  blockTimestamp: string;
  status: ProposalState;
  chainId?: number;
}

interface AiAnalysisStandaloneProps {
  proposalData: ProposalData;
  analysisData: AiAnalysisData | null;
  loading?: boolean;
  error?: string | null;
  onClose?: () => void;
  onRefresh?: () => void;
}

const StarRating = ({
  rating,
  total = 10,
}: {
  rating: number;
  total?: number;
}) => {
  return (
    <div className="flex items-center gap-[10px]">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="w-6 h-6 relative">
          <Image
            src={
              i < rating
                ? "/assets/image/star-active.svg"
                : "/assets/image/star.svg"
            }
            alt={i < rating ? "Active star" : "Inactive star"}
            width={24}
            height={24}
            className="w-6 h-6"
          />
        </div>
      ))}
    </div>
  );
};

const VoteProgressBar = ({
  forVotes,
  forPercentage,
  againstVotes,
  againstPercentage,
  abstainVotes,
  abstainPercentage,
}: {
  forVotes: string;
  forPercentage: number;
  againstVotes: string;
  againstPercentage: number;
  abstainVotes: string;
  abstainPercentage: number;
}) => {
  return (
    <div className="flex flex-col gap-[10px]">
      <div className="flex h-[6px] w-full items-center rounded-[2px] overflow-hidden bg-muted">
        <div
          className="bg-success h-full"
          style={{ width: `${forPercentage}%` }}
        />
        <div
          className="bg-danger h-full"
          style={{ width: `${againstPercentage}%` }}
        />
        <div
          className="bg-muted-foreground h-full"
          style={{ width: `${abstainPercentage}%` }}
        />
      </div>
      <div className="flex flex-col gap-[10px]">
        <div className="flex items-center justify-between gap-[10px]">
          <div className="flex items-center gap-[5px]">
            <span className="inline-block h-[16px] w-[16px] rounded-full bg-success" />
            <span className="text-[14px] font-normal">For</span>
          </div>
          <span className="text-[14px] font-medium">{forVotes}</span>
        </div>
        <div className="flex items-center justify-between gap-[10px]">
          <div className="flex items-center gap-[5px]">
            <span className="inline-block h-[16px] w-[16px] rounded-full bg-danger" />
            <span className="text-[14px] font-normal">Against</span>
          </div>
          <span className="text-[14px] font-medium">{againstVotes}</span>
        </div>
        <div className="flex items-center justify-between gap-[10px]">
          <div className="flex items-center gap-[5px]">
            <span className="inline-block h-[16px] w-[16px] rounded-full bg-muted-foreground" />
            <span className="text-[14px] font-normal">Abstain</span>
          </div>
          <span className="text-[14px] font-medium">{abstainVotes}</span>
        </div>
      </div>
    </div>
  );
};

const SentimentProgressBar = ({
  positive,
  negative,
  neutral,
}: {
  positive: number;
  negative: number;
  neutral: number;
}) => {
  return (
    <div className="flex flex-col gap-[10px]">
      <div className="flex h-[6px] w-full items-center rounded-[2px] overflow-hidden bg-muted">
        <div className="bg-success h-full" style={{ width: `${positive}%` }} />
        <div className="bg-danger h-full" style={{ width: `${negative}%` }} />
        <div
          className="bg-muted-foreground h-full"
          style={{ width: `${neutral}%` }}
        />
      </div>
      <div className="flex flex-col gap-[10px]">
        <div className="flex items-center justify-between gap-[10px]">
          <div className="flex items-center gap-[5px]">
            <span className="inline-block h-[16px] w-[16px] rounded-full bg-success" />
            <span className="text-[14px] font-normal">Positive</span>
          </div>
          <span className="text-[14px] font-medium">{positive}%</span>
        </div>
        <div className="flex items-center justify-between gap-[10px]">
          <div className="flex items-center gap-[5px]">
            <span className="inline-block h-[16px] w-[16px] rounded-full bg-danger" />
            <span className="text-[14px] font-normal">Negative</span>
          </div>
          <span className="text-[14px] font-medium">{negative}%</span>
        </div>
        <div className="flex items-center justify-between gap-[10px]">
          <div className="flex items-center gap-[5px]">
            <span className="inline-block h-[16px] w-[16px] rounded-full bg-muted-foreground" />
            <span className="text-[14px] font-normal">Neutral</span>
          </div>
          <span className="text-[14px] font-medium">{neutral}%</span>
        </div>
      </div>
    </div>
  );
};

// Helper function to get vote type from final result
const getVoteTypeFromResult = (result: string): VoteType => {
  switch (result.toLowerCase()) {
    case "for":
      return VoteType.For;
    case "against":
      return VoteType.Against;
    case "abstain":
      return VoteType.Abstain;
    default:
      return VoteType.Abstain;
  }
};

// Helper function to get proposal state from status
const getProposalStateFromStatus = (status: string): ProposalState => {
  switch (status.toLowerCase()) {
    case "defeated":
      return ProposalState.Defeated;
    case "succeeded":
      return ProposalState.Succeeded;
    case "active":
      return ProposalState.Active;
    case "pending":
      return ProposalState.Pending;
    case "canceled":
      return ProposalState.Canceled;
    case "queued":
      return ProposalState.Queued;
    case "executed":
      return ProposalState.Executed;
    default:
      return ProposalState.Defeated;
  }
};

// Helper function to format vote counts
const formatVoteCount = (votes: number): string => {
  if (votes >= 1000000) {
    return `${(votes / 1000000).toFixed(2)}M`;
  } else if (votes >= 1000) {
    return `${(votes / 1000).toFixed(1)}K`;
  }
  return votes.toString();
};

export const AiAnalysisStandalone: React.FC<AiAnalysisStandaloneProps> = ({
  proposalData,
  analysisData,
  loading = false,
  error = null,
  onClose,
  onRefresh,
}) => {
  const analysisOutput = analysisData?.fulfilled_explain?.output;
  const votingBreakdown = analysisOutput?.votingBreakdown;

  const reasoningLiteHtml = useMemo(() => {
    if (!analysisOutput?.reasoningLite) return "";
    const html = marked.parse(analysisOutput.reasoningLite) as string;
    return DOMPurify.sanitize(html);
  }, [analysisOutput?.reasoningLite]);

  const sanitizedHtml = useMemo(() => {
    if (!analysisOutput?.reasoning) return "";
    const html = marked.parse(analysisOutput.reasoning) as string;
    return DOMPurify.sanitize(html);
  }, [analysisOutput?.reasoning]);

  const renderContent = () => {
    if (loading) {
      return (
        <LoadingState
          title="Analyzing Proposal"
          description="Fetching AI voting analysis data from DeGov.AI agent..."
          className="min-h-[400px]"
        />
      );
    }

    if (error) {
      return (
        <ErrorState
          title="Failed to Load Analysis"
          description={error}
          onRetry={onRefresh}
          className="min-h-[400px]"
        />
      );
    }

    if (!analysisData || !analysisOutput || !votingBreakdown) {
      return (
        <ErrorState
          title="No Analysis Available"
          description="AI analysis data is not available for this proposal yet."
          onRetry={onRefresh}
          className="min-h-[400px]"
        />
      );
    }

    return (
      <>
        {/* Title Section */}
        <div className="space-y-[20px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-[10px]">
              <AiTitleIcon1 className="w-[32px] h-[32px]" />
              <h2 className="text-[26px] font-semibold text-foreground">
                Agent Voting Reason Analysis
              </h2>
            </div>

            <ProposalStatus
              status={getProposalStateFromStatus(analysisData.status)}
            />
          </div>
          <div className="flex flex-col gap-[20px] bg-card p-[20px] rounded-[14px]">
            <h3 className="text-[36px] font-semibold text-foreground">
              {extractTitleAndDescription(proposalData.description)?.title}
            </h3>
            <div className="text-[14px] text-foreground">
              <span className="font-normal">Proposal ID:</span>{" "}
              <span className="font-semibold">{analysisData.proposal_id}</span>
            </div>
            <div className="flex items-center gap-[5px]">
              <span className="text-[14px] text-foreground">Proposed by</span>
              <AddressWithAvatar
                address={proposalData.proposer as `0x${string}`}
                avatarSize={24}
                className="gap-[5px] text-[14px] font-semibold"
              />
              <span className="text-[14px] text-foreground">
                On{" "}
                <span className="font-semibold">
                  {formatTimestampToFriendlyDate(analysisData.ctime)}
                </span>
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-[14px] bg-card p-[20px] flex flex-col gap-[10px]">
              <div className="text-[12px] text-muted-foreground">Chain</div>
              <div className="text-[14px] font-semibold">
                {analysisData.dao.config.chain.name}
              </div>
            </div>
            <div className="rounded-[14px] bg-card p-[20px] flex flex-col gap-[10px]">
              <div className="text-[12px] text-muted-foreground">ID</div>
              <div className="text-[14px] font-semibold underline">
                {analysisData.id}
              </div>
            </div>
            <div className="rounded-[14px] bg-card p-[20px] flex flex-col gap-[10px]">
              <div className="text-[12px] text-muted-foreground">DAO</div>
              <div className="text-[14px] font-semibold underline">
                {analysisData.dao.name}
              </div>
            </div>
            <div className="rounded-[14px] bg-card p-[20px] flex flex-col gap-[10px]">
              <div className="text-[12px] text-muted-foreground">Created</div>
              <div className="text-[14px] font-semibold">
                {new Date(analysisData.ctime).toISOString()}
              </div>
            </div>
          </div>
        </div>

        {/* Vote Analysis */}
        <div className="rounded-[14px] flex flex-col gap-[20px]">
          <div className="flex items-center gap-[10px]">
            <AiTitleIcon2 className="w-[32px] h-[32px]" />
            <h3 className="text-[18px] font-semibold">Vote Analysis</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-card p-[20px] rounded-[14px] flex flex-col gap-[20px]">
              <h4 className="text-[18px] font-medium">X Poll</h4>
              <VoteProgressBar
                forVotes={formatVoteCount(
                  analysisData.fulfilled_explain.input.pollOptions.find(
                    (o) => o.label === "For"
                  )?.votes || 0
                )}
                forPercentage={votingBreakdown.twitterPoll.for}
                againstVotes={formatVoteCount(
                  analysisData.fulfilled_explain.input.pollOptions.find(
                    (o) => o.label === "Against"
                  )?.votes || 0
                )}
                againstPercentage={votingBreakdown.twitterPoll.against}
                abstainVotes={formatVoteCount(
                  analysisData.fulfilled_explain.input.pollOptions.find(
                    (o) => o.label === "Abstain"
                  )?.votes || 0
                )}
                abstainPercentage={votingBreakdown.twitterPoll.abstain}
              />
            </div>

            <div className="bg-card p-[20px] rounded-[14px] flex flex-col gap-[20px]">
              <h4 className="text-[18px] font-medium">On-Chain Votes</h4>
              <VoteProgressBar
                forVotes={formatVoteCount(votingBreakdown.onChainVotes.for)}
                forPercentage={
                  votingBreakdown.onChainVotes.for > 0
                    ? (votingBreakdown.onChainVotes.for /
                        (votingBreakdown.onChainVotes.for +
                          votingBreakdown.onChainVotes.against +
                          votingBreakdown.onChainVotes.abstain)) *
                      100
                    : 0
                }
                againstVotes={formatVoteCount(
                  votingBreakdown.onChainVotes.against
                )}
                againstPercentage={
                  votingBreakdown.onChainVotes.against > 0
                    ? (votingBreakdown.onChainVotes.against /
                        (votingBreakdown.onChainVotes.for +
                          votingBreakdown.onChainVotes.against +
                          votingBreakdown.onChainVotes.abstain)) *
                      100
                    : 100
                }
                abstainVotes={formatVoteCount(
                  votingBreakdown.onChainVotes.abstain
                )}
                abstainPercentage={
                  votingBreakdown.onChainVotes.abstain > 0
                    ? (votingBreakdown.onChainVotes.abstain /
                        (votingBreakdown.onChainVotes.for +
                          votingBreakdown.onChainVotes.against +
                          votingBreakdown.onChainVotes.abstain)) *
                      100
                    : 0
                }
              />
            </div>

            <div className="bg-card p-[20px] rounded-[14px] flex flex-col gap-[20px]">
              <h4 className="text-[18px] font-medium">Comment Sentiment</h4>
              <SentimentProgressBar
                positive={votingBreakdown.twitterComments.positive}
                negative={votingBreakdown.twitterComments.negative}
                neutral={votingBreakdown.twitterComments.neutral}
              />
            </div>
          </div>
        </div>

        {/* Final Decision */}
        <div className="flex flex-col gap-[20px]">
          <div className="flex items-center gap-[10px]">
            <AiTitleIcon3 />
            <h3 className="text-[18px] font-semibold">Final Decision</h3>
          </div>

          <div className="rounded-[14px] bg-card p-[20px] border border-border/20">
            <div className="flex items-center justify-between mb-4">
              <VoteStatusAction
                variant={getVoteTypeFromResult(analysisOutput.finalResult)}
                type={"active"}
                className="w-[113px] flex justify-center"
              />
              <div className="flex items-center gap-2">
                <span className="text-[14px] text-muted-foreground">
                  Confidence
                </span>
                <StarRating rating={analysisOutput.confidence} />
              </div>
            </div>

            <div className="flex flex-col gap-[10px] bg-card-background rounded-[14px] p-[20px]">
              <h4 className="text-[18px] font-semibold">Executive Summary</h4>
              <div
                className="markdown-body"
                dangerouslySetInnerHTML={{ __html: reasoningLiteHtml }}
              />
            </div>
          </div>

          <div className="rounded-[14px] bg-card p-[20px]">
            <h3 className="text-[18px] font-semibold mb-[20px]">
              Voting Reason
            </h3>

            <div
              className="markdown-body"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute right-6 top-6 z-10 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="flex flex-col gap-[60px] p-[60px]">
          {/* Header */}
          <div className="flex items-center justify-center gap-2">
            <AiLogo className="h-[50px]" />
          </div>
          <div className="w-full h-[1px] bg-muted-foreground" />

          {renderContent()}
        </div>
      </div>
    </div>
  );
};

// Also export the dialog version for backward compatibility
export const AgentVotingAnalysisDialog = AiAnalysisStandalone;
