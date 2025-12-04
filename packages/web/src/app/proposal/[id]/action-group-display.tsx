import {
  ProposalActionCheckIcon,
  ErrorIcon,
  CancelIcon,
  ClockIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { VoteType } from "@/config/vote";
import { ProposalState } from "@/types/proposal";

import type { JSX } from "react";

const VOTE_ICON_MAP: Partial<
  Record<
    VoteType,
    (props: { width?: number; height?: number; className?: string }) => JSX.Element
  >
> = {
  [VoteType.For]: ProposalActionCheckIcon,
  [VoteType.Against]: ErrorIcon,
  [VoteType.Abstain]: CancelIcon,
};

const VOTE_LABEL_MAP: Partial<Record<VoteType, string>> = {
  [VoteType.For]: "For",
  [VoteType.Against]: "Against",
  [VoteType.Abstain]: "Abstain",
};
interface ActionGroupDisplayProps {
  status?: ProposalState;
  isLoading: boolean;
  votedSupport?: VoteType;
  canExecute: boolean;
  hasTimelock: boolean;
  onClick: (action: "vote" | "queue" | "execute") => void;
}
export const ActionGroupDisplay = ({
  status,
  isLoading,
  onClick,
  votedSupport,
  canExecute,
  hasTimelock,
}: ActionGroupDisplayProps) => {
  if (status === ProposalState.Pending) {
    return (
      <div className="flex items-center gap-[10px]">
        <ClockIcon width={20} height={20} className="text-current" />
        <p>Voting starts soon</p>
      </div>
    );
  }
  if (status === ProposalState.Active) {
    const VoteIcon =
      votedSupport !== undefined ? VOTE_ICON_MAP[votedSupport] : null;
    const voteLabel =
      votedSupport !== undefined ? VOTE_LABEL_MAP[votedSupport] : null;

    if (VoteIcon && voteLabel) {
      return (
        <p className="flex items-center gap-[10px] text-[14px] font-normal">
          <VoteIcon width={20} height={20} className="text-current" />
          You voted {voteLabel}
        </p>
      );
    }
    return (
      <Button
        className="h-[37px] rounded-[100px] focus-visible:ring-0"
        onClick={() => onClick("vote")}
        isLoading={isLoading}
      >
        Vote Onchain
      </Button>
    );
  }
  if (status === ProposalState.Succeeded) {
    // If no timelock, show Execute button directly
    if (!hasTimelock) {
      return (
        <Button
          className="h-[37px] rounded-[100px] focus-visible:ring-0"
          isLoading={isLoading}
          disabled={!canExecute}
          onClick={() => onClick("execute")}
        >
          Execute
        </Button>
      );
    }

    // If timelock is enabled, show Queue button
    return (
      <Button
        className="h-[37px] rounded-[100px] focus-visible:ring-0"
        isLoading={isLoading}
        onClick={() => onClick("queue")}
      >
        Queue
      </Button>
    );
  }
  if (status === ProposalState.Queued) {
    return (
      <Button
        className="h-[37px] rounded-[100px] focus-visible:ring-0"
        isLoading={isLoading}
        disabled={!canExecute}
        onClick={() => onClick("execute")}
      >
        Execute
      </Button>
    );
  }
  if (status === ProposalState.Executed) {
    return (
      <div className="flex items-center gap-[10px]">
        <ProposalActionCheckIcon
          width={20}
          height={20}
          className="text-current"
        />
        <p>Proposal executed</p>
      </div>
    );
  }
  if (status === ProposalState.Canceled) {
    return (
      <div className="flex items-center gap-[10px]">
        <CancelIcon width={20} height={20} className="text-current" />
        <p>Proposal canceled</p>
      </div>
    );
  }
  if (status === ProposalState.Expired) {
    return (
      <div className="flex items-center gap-[10px]">
        <CancelIcon width={20} height={20} className="text-current" />
        <p>Proposal expired</p>
      </div>
    );
  }
  if (status === ProposalState.Defeated) {
    return (
      <div className="flex items-center gap-[10px]">
        <CancelIcon width={20} height={20} className="text-current" />
        <p>Proposal defeated</p>
      </div>
    );
  }

  return null;
};
