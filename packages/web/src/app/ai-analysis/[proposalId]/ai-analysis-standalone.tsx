import DOMPurify from "dompurify";
import { marked } from "marked";
import Link from "next/link";
import React, { useMemo } from "react";

import { AddressWithAvatar } from "@/components/address-with-avatar";
import { ExternalLinkIcon, StarIcon, StarActiveIcon } from "@/components/icons";
import { AiLogo } from "@/components/icons/ai-logo";
import { AiTitleIcon as AiTitleIcon1 } from "@/components/icons/ai-title-icon-1";
import { AiTitleIcon as AiTitleIcon2 } from "@/components/icons/ai-title-icon-2";
import { AiTitleIcon as AiTitleIcon3 } from "@/components/icons/ai-title-icon-3";
import { ProposalStatus } from "@/components/proposal-status";
import { LoadingState, ErrorState } from "@/components/ui/loading-spinner";
import { VoteStatusAction } from "@/components/vote-status";
import { VoteType } from "@/config/vote";
import { useDeviceDetection } from "@/hooks/useDeviceDetection";
import type { AiAnalysisData } from "@/types/ai-analysis";
import { ProposalState } from "@/types/proposal";
import { extractTitleAndDescription } from "@/utils";
import { formatTimeAgo } from "@/utils/date";

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
    <div className="flex items-center gap-[5px] lg:gap-[10px]">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="w-4 lg:w-6 h-4 lg:h-6 relative">
          {i < rating ? (
            <StarActiveIcon className="w-4 lg:w-6 h-4 lg:h-6" />
          ) : (
            <StarIcon className="w-4 lg:w-6 h-4 lg:h-6" />
          )}
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
      <div className="flex flex-wrap gap-4 sm:gap-6 justify-between">
        <div className="flex items-center gap-[5px]">
          <span className="inline-block h-[16px] w-[16px] rounded-full bg-success" />
          <span className="text-[14px] font-normal">For</span>
          <span className="text-[14px] font-medium">{forVotes}</span>
        </div>
        <div className="flex items-center gap-[5px]">
          <span className="inline-block h-[16px] w-[16px] rounded-full bg-danger" />
          <span className="text-[14px] font-normal">Against</span>
          <span className="text-[14px] font-medium">{againstVotes}</span>
        </div>
        <div className="flex items-center gap-[5px]">
          <span className="inline-block h-[16px] w-[16px] rounded-full bg-muted-foreground" />
          <span className="text-[14px] font-normal">Abstain</span>
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
      <div className="flex flex-wrap gap-4 sm:gap-6 justify-between">
        <div className="flex items-center gap-[5px]">
          <span className="inline-block h-[16px] w-[16px] rounded-full bg-success" />
          <span className="text-[14px] font-normal">Positive</span>
          <span className="text-[14px] font-medium">{positive}%</span>
        </div>
        <div className="flex items-center gap-[5px]">
          <span className="inline-block h-[16px] w-[16px] rounded-full bg-danger" />
          <span className="text-[14px] font-normal">Negative</span>
          <span className="text-[14px] font-medium">{negative}%</span>
        </div>
        <div className="flex items-center gap-[5px]">
          <span className="inline-block h-[16px] w-[16px] rounded-full bg-muted-foreground" />
          <span className="text-[14px] font-normal">Neutral</span>
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
  onRefresh,
}) => {
  const { isClient } = useDeviceDetection();

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
              <h2 className="text-[18px] lg:text-[26px] font-semibold text-foreground">
                Agent Voting Reason Analysis
              </h2>
            </div>

            <ProposalStatus
              status={getProposalStateFromStatus(analysisData.status)}
            />
          </div>
          <div className="flex flex-col gap-[20px] bg-card p-[10px] lg:p-[20px] rounded-[14px]">
            <h3 className="text-[16px] lg:text-[26px] font-semibold text-foreground flex items-center gap-[10px]">
              {extractTitleAndDescription(proposalData.description)?.title}
              <Link
                href={`/proposal/${proposalData.proposalId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80 transition-opacity"
              >
                <ExternalLinkIcon
                  width={24}
                  height={24}
                  className="h-[24px] w-[24px] text-foreground"
                />
              </Link>
            </h3>
            <div className="text-[12px] lg:text-[14px] text-foreground">
              <span className="font-normal">Proposal ID:</span>{" "}
              <span className="font-semibold break-all block lg:inline">
                {analysisData.proposal_id}
              </span>
            </div>
            <div className="flex items-center gap-[20px] lg:gap-[5px] text-[12px] lg:text-[14px]">
              <span className=" text-foreground hidden lg:block">
                Proposed by
              </span>
              {!!proposalData.proposer && (
                <AddressWithAvatar
                  address={proposalData.proposer as `0x${string}`}
                  avatarSize={24}
                  className="gap-[5px] font-semibold"
                />
              )}

              <span className="text-foreground flex items-center gap-[20px] lg:gap-[5px]">
                <div className="hidden lg:block">On</div>
                <span className="font-semibold">
                  {proposalData.blockTimestamp
                    ? formatTimeAgo(proposalData.blockTimestamp)
                    : ""}
                </span>
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-[14px] bg-card p-[10px] lg:p-[20px] flex flex-col gap-[10px]">
              <div className="text-[12px] text-foreground">Chain</div>
              <div className="text-[14px] font-semibold">
                {analysisData.dao.config.chain.name}
              </div>
            </div>
            <div className="rounded-[14px] bg-card p-[10px] lg:p-[20px] flex flex-col gap-[10px]">
              <div className="text-[12px] text-foreground">X</div>
              <a
                href={`https://x.com/${analysisData.twitter_user.username}/status/${analysisData.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[14px] font-semibold underline"
              >
                {analysisData.id}
              </a>
            </div>
            <div className="rounded-[14px] bg-card p-[10px] lg:p-[20px] flex flex-col gap-[10px]">
              <div className="text-[12px] text-foreground">DAO</div>
              <a
                href={analysisData?.dao?.links?.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[14px] font-semibold underline"
              >
                {analysisData.dao.name}
              </a>
            </div>
            <div className="rounded-[14px] bg-card p-[10px] lg:p-[20px] flex flex-col gap-[10px]">
              <div className="text-[12px] text-foreground">Created</div>
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
            <div className="bg-card p-[10px] lg:p-[20px] rounded-[14px] flex flex-col gap-[20px]">
              <h4 className="text-[18px] font-medium">X Poll</h4>
              <VoteProgressBar
                forVotes={votingBreakdown.twitterPoll.for.toString()}
                forPercentage={votingBreakdown.twitterPoll.for}
                againstVotes={votingBreakdown.twitterPoll.against.toString()}
                againstPercentage={votingBreakdown.twitterPoll.against}
                abstainVotes={votingBreakdown.twitterPoll.abstain.toString()}
                abstainPercentage={votingBreakdown.twitterPoll.abstain}
              />
            </div>

            <div className="bg-card p-[10px] lg:p-[20px] rounded-[14px] flex flex-col gap-[20px]">
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

            <div className="bg-card p-[10px] lg:p-[20px] rounded-[14px] flex flex-col gap-[20px]">
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

          <div className="rounded-[14px] bg-card p-[10px] lg:p-[20px] border border-border/20">
            <div className="flex items-center justify-between mb-4">
              <VoteStatusAction
                variant={getVoteTypeFromResult(analysisOutput.finalResult)}
                type={"active"}
                className="w-[80px] lg:w-[113px] flex justify-center"
              />
              <div className="flex items-center gap-2">
                <span className="text-[14px] text-muted-foreground hidden lg:block">
                  Confidence
                </span>
                <StarRating rating={analysisOutput.confidence} />
              </div>
            </div>

            <div className="flex flex-col gap-[10px] bg-card-background rounded-[14px] p-[10px] lg:p-[20px]">
              <h4 className="text-[18px] font-semibold">Executive Summary</h4>
              <div
                className="markdown-body"
                dangerouslySetInnerHTML={{ __html: reasoningLiteHtml }}
              />
            </div>
          </div>

          <div className="rounded-[14px] bg-card p-[10px] lg:p-[20px] flex flex-col gap-[20px]">
            <h3 className="text-[18px] font-semibold">Voting Reason</h3>
            <div className="w-full h-[1px] bg-gray-1"></div>
            <div
              className="markdown-body overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-background max-w-[1340px] mx-auto">
      <div className="relative">
        <div className="flex flex-col gap-[20px] lg:gap-[60px] p-[15px] lg:p-[60px]">
          <div className="flex items-center justify-center gap-2">
            <AiLogo
              className="h-[30px] lg:h-[50px]"
              height={isClient ? 50 : 30}
            />
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
