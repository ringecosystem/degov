import Image from "next/image";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { VoteType } from "@/config/vote";
import { ProposalState } from "@/types/proposal";
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
  const voteInfo = useMemo(() => {
    switch (votedSupport) {
      case VoteType.For:
        return {
          label: "For",
          value: VoteType.For,

          icon: "/assets/image/proposal/action/check.svg",
          lightIcon: "/assets/image/light/proposal/action/check.svg",
        };
      case VoteType.Against:
        return {
          label: "Against",
          value: VoteType.Against,
          icon: "/assets/image/proposal/action/error.svg",
          lightIcon: "/assets/image/light/proposal/action/error.svg",
        };
      case VoteType.Abstain:
        return {
          label: "Abstain",
          value: VoteType.Abstain,
          icon: "/assets/image/proposal/action/cancel.svg",
          lightIcon: "/assets/image/light/proposal/action/cancel.svg",
        };
      default:
        return null;
    }
  }, [votedSupport]);

  if (status === ProposalState.Pending) {
    return (
      <div className="flex items-center gap-[10px]">
        <Image
          src="/assets/image/light/proposal/action/clock.svg"
          alt="pending"
          width={20}
          height={20}
          className="dark:hidden"
        />
        <Image
          src="/assets/image/proposal/action/clock.svg"
          alt="pending"
          width={20}
          height={20}
          className="hidden dark:block"
        />

        <p>Voting starts soon</p>
      </div>
    );
  }
  if (status === ProposalState.Active) {
    if (voteInfo) {
      return (
        <p className="flex items-center gap-[10px] text-[14px] font-normal">
          <Image
            src={voteInfo.lightIcon}
            alt={voteInfo.label}
            width={20}
            height={20}
            className="dark:hidden"
          />
          <Image
            alt={voteInfo.label}
            src={voteInfo.icon}
            width={20}
            height={20}
            className="hidden dark:block"
          />
          You voted {voteInfo.label}
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
        <Image
          src="/assets/image/light/proposal/action/check.svg"
          alt="executed"
          width={20}
          height={20}
          className="dark:hidden"
        />
        <Image
          src="/assets/image/proposal/action/check.svg"
          alt="executed"
          width={20}
          height={20}
          className="hidden dark:block"
        />
        <p>Proposal executed</p>
      </div>
    );
  }
  if (status === ProposalState.Canceled) {
    return (
      <div className="flex items-center gap-[10px]">
        <Image
          src="/assets/image/light/proposal/action/cancel.svg"
          alt="canceled"
          width={20}
          height={20}
          className="dark:hidden"
        />
        <Image
          src="/assets/image/proposal/action/cancel.svg"
          alt="canceled"
          width={20}
          height={20}
          className="hidden dark:block"
        />
        <p>Proposal canceled</p>
      </div>
    );
  }
  if (status === ProposalState.Expired) {
    return (
      <div className="flex items-center gap-[10px]">
        <Image
          src="/assets/image/light/proposal/action/cancel.svg"
          alt="expired"
          width={20}
          height={20}
          className="dark:hidden"
        />
        <Image
          src="/assets/image/proposal/action/cancel.svg"
          alt="expired"
          width={20}
          height={20}
          className="hidden dark:block"
        />
        <p>Proposal expired</p>
      </div>
    );
  }
  if (status === ProposalState.Defeated) {
    return (
      <div className="flex items-center gap-[10px]">
        <Image
          src="/assets/image/light/proposal/action/cancel.svg"
          alt="defeated"
          width={20}
          height={20}
          className="dark:hidden"
        />
        <Image
          src="/assets/image/proposal/action/cancel.svg"
          alt="defeated"
          width={20}
          height={20}
          className="hidden dark:block"
        />
        <p>Proposal defeated</p>
      </div>
    );
  }

  return null;
};
