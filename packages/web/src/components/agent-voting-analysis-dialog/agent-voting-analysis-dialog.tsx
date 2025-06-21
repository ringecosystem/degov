import React from "react";
import Image from "next/image";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { AddressWithAvatar } from "@/components/address-with-avatar";
import { ProposalStatus } from "@/components/proposal-status";
import { X } from "lucide-react";
import { ProposalState } from "@/types/proposal";
import { formatTimestampToFriendlyDate } from "@/utils/date";

interface AgentVotingAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalData?: {
    proposalId: string;
    title: string;
    description: string;
    proposer: string;
    blockTimestamp: string;
    status: ProposalState;
  };
}

const StarRating = ({
  rating,
  total = 10,
}: {
  rating: number;
  total?: number;
}) => {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`w-3 h-3 rounded-sm ${
            i < rating ? "bg-warning" : "bg-muted-foreground/30"
          }`}
        />
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

export const AgentVotingAnalysisDialog: React.FC<
  AgentVotingAnalysisDialogProps
> = ({ open, onOpenChange, proposalData }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-background border-border p-0">
        <div className="relative">
          {/* Close button */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-6 top-6 z-10 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="p-6 space-y-6">
            {/* Header */}
            <div className="text-center pb-4">
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className="w-6 h-6 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path
                      d="M10 0L12.1 7.9L20 10L12.1 12.1L10 20L7.9 12.1L0 10L7.9 7.9L10 0Z"
                      fill="currentColor"
                    />
                  </svg>
                </div>
                <h1 className="text-[18px] font-semibold">DEGOV.AI</h1>
              </div>
              <Separator className="bg-border/20" />
            </div>

            {/* Title Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Image
                  src="/assets/image/proposal/status-published.svg"
                  alt="analysis"
                  width={24}
                  height={24}
                />
                <h2 className="text-[18px] font-semibold">
                  Agent Voting Reason Analysis
                </h2>
                <ProposalStatus status={ProposalState.Defeated} />
              </div>

              <h3 className="text-[26px] font-semibold text-foreground">
                [Non-Constitutional] DCDAO Delegate Incentive Program
              </h3>

              <div className="flex flex-col gap-[10px]">
                <div className="text-[14px] text-muted-foreground">
                  <span className="font-medium">Proposal ID:</span>{" "}
                  {proposalData?.proposalId ||
                    "0x474ec4da8ae93a02f63445e646682dbc06a4b55286e86c750bcd7916385b3907"}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[14px] text-muted-foreground">
                    Proposed by
                  </span>
                  <AddressWithAvatar
                    address={
                      (proposalData?.proposer as `0x${string}`) ||
                      "0x1234567890123456789012345678901234567890"
                    }
                    displayName="Bear Wang"
                  />
                  <span className="text-[14px] text-muted-foreground">
                    On{" "}
                    {formatTimestampToFriendlyDate(
                      proposalData?.blockTimestamp || "1704499200000"
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-[14px] bg-card p-[20px]">
                <div className="text-[12px] text-muted-foreground mb-2">
                  Chain
                </div>
                <div className="text-[14px] font-medium">Darwinia Network</div>
              </div>
              <div className="rounded-[14px] bg-card p-[20px]">
                <div className="text-[12px] text-muted-foreground mb-2">ID</div>
                <div className="text-[14px] font-medium">
                  193490697871614792
                </div>
              </div>
              <div className="rounded-[14px] bg-card p-[20px]">
                <div className="text-[12px] text-muted-foreground mb-2">
                  DAO
                </div>
                <div className="text-[14px] font-medium">
                  DeGov Development Test DAO
                </div>
              </div>
              <div className="rounded-[14px] bg-card p-[20px]">
                <div className="text-[12px] text-muted-foreground mb-2">
                  Created
                </div>
                <div className="text-[14px] font-medium">
                  2025-06-17T09:32:26.935Z
                </div>
              </div>
            </div>

            {/* Vote Analysis */}
            <div className="rounded-[14px] bg-card p-[20px]">
              <div className="flex items-center gap-2 mb-[20px]">
                <Image
                  src="/assets/image/proposal/status-ended.svg"
                  alt="votes"
                  width={20}
                  height={20}
                />
                <h3 className="text-[18px] font-semibold">Vote Analysis</h3>
              </div>
              <Separator className="!my-0 bg-border/20 mb-[20px]" />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <h4 className="text-[16px] font-medium">X Poll</h4>
                  <VoteProgressBar
                    forVotes="10.79M"
                    forPercentage={45}
                    againstVotes="5.62K"
                    againstPercentage={25}
                    abstainVotes="8.8K"
                    abstainPercentage={30}
                  />
                </div>

                <div className="space-y-3">
                  <h4 className="text-[16px] font-medium">On-Chain Votes</h4>
                  <VoteProgressBar
                    forVotes="10.79M"
                    forPercentage={45}
                    againstVotes="5.62K"
                    againstPercentage={25}
                    abstainVotes="8.8K"
                    abstainPercentage={30}
                  />
                </div>

                <div className="space-y-3">
                  <h4 className="text-[16px] font-medium">Comment Sentiment</h4>
                  <SentimentProgressBar
                    positive={50}
                    negative={40}
                    neutral={10}
                  />
                </div>
              </div>
            </div>

            {/* Final Decision */}
            <div className="rounded-[14px] bg-card p-[20px]">
              <div className="flex items-center gap-2 mb-[20px]">
                <Image
                  src="/assets/image/proposal/status-executed.svg"
                  alt="decision"
                  width={20}
                  height={20}
                />
                <h3 className="text-[18px] font-semibold">Final Decision</h3>
              </div>
              <Separator className="!my-0 bg-border/20 mb-[20px]" />

              <div className="rounded-[14px] bg-card-background p-[20px] border border-border/20">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-success rounded-full flex items-center justify-center">
                      <Image
                        src="/assets/image/proposal/check.svg"
                        alt="check"
                        width={16}
                        height={16}
                      />
                    </div>
                    <span className="text-[16px] font-medium">For</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] text-muted-foreground">
                      Confidence
                    </span>
                    <StarRating rating={8} />
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[16px] font-medium">Executive Summary</h4>
                  <p className="text-[14px] text-muted-foreground leading-relaxed">
                    The governance proposal analysis reveals a significant
                    disconnect between social sentiment and on-chain voting
                    results. While tweet comments slightly favor the proposal,
                    the on-chain vote leans against it, with moderate abstention
                    stance. Due to these contradictions and the lack of clear
                    consensus, the final decision is to abstain, indicating a
                    need for further discussion and community engagement to
                    resolve these differences.
                  </p>
                </div>
              </div>
            </div>

            {/* Voting Reason */}
            <div className="rounded-[14px] bg-card p-[20px]">
              <h3 className="text-[18px] font-semibold mb-[20px]">
                Voting Reason
              </h3>
              <Separator className="!my-0 bg-border/20 mb-[20px]" />

              <div className="space-y-6">
                <div>
                  <h4 className="text-[16px] font-semibold mb-4">
                    Governance Proposal Analysis Report
                  </h4>

                  <div className="space-y-4 text-[14px]">
                    <div>
                      <h5 className="font-medium mb-2 text-foreground">
                        1. Executive Summary
                      </h5>
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                        <li>
                          <span className="text-foreground font-medium">
                            Final Decision:
                          </span>{" "}
                          Abstain
                        </li>
                        <li>
                          <span className="text-foreground font-medium">
                            Confidence Score:
                          </span>{" "}
                          4 / 10
                        </li>
                      </ul>
                    </div>

                    <div>
                      <h5 className="font-medium mb-2 text-foreground">
                        2. Data Overview
                      </h5>
                    </div>

                    <div>
                      <h5 className="font-medium mb-2 text-foreground">
                        3. Comprehensive Analysis and Reasoning
                      </h5>
                    </div>

                    <div>
                      <h5 className="font-medium mb-2 text-foreground">
                        A. Twitter Poll Analysis (40%)
                      </h5>
                      <p className="text-muted-foreground ml-4 leading-relaxed">
                        The Twitter poll had no participation, rendering it
                        ineffective for gauging community sentiment. This lack
                        of data significantly reduces the weight of this source
                        in the overall analysis.
                      </p>
                    </div>

                    <div>
                      <h5 className="font-medium mb-2 text-foreground">
                        B. Comment Analysis (40%)
                      </h5>
                      <p className="text-muted-foreground ml-4 leading-relaxed">
                        The comments were split, with a slight majority
                        expressing support for the proposal. Supporters
                        highlighted the strategic advantage of cultivating
                        talent and the financial benefits, while opponents
                        focused on the potential misallocation of senior
                        engineers' time. The arguments were well-reasoned, but
                        no significant influence from KOLs was detected.
                      </p>
                    </div>

                    <div>
                      <h5 className="font-medium mb-2 text-foreground">
                        C. On-Chain Analysis (20%)
                      </h5>
                      <p className="text-muted-foreground ml-4 leading-relaxed">
                        The on-chain voting results show mixed signals with
                        moderate participation rates. The voting pattern
                        suggests community uncertainty about the proposal's
                        implementation timeline and resource allocation
                        strategy.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
