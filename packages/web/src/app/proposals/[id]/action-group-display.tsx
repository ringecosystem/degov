import Image from "next/image";

import { Button } from "@/components/ui/button";
import { ProposalState } from "@/types/proposal";

interface ActionGroupDisplayProps {
  status?: ProposalState;
  isLoading: boolean;
  isConnected: boolean;
  hasVoted?: boolean;
  canExecute: boolean;
  onClick: (action: "vote" | "queue" | "execute") => void;
}
export const ActionGroupDisplay = ({
  status,
  isLoading,
  onClick,
  isConnected,
  hasVoted,
  canExecute,
}: ActionGroupDisplayProps) => {
  if (status === ProposalState.Pending) {
    return (
      <div className="flex items-center gap-4">
        <Image
          src="/assets/image/proposal/action/clock.svg"
          alt="pending"
          width={20}
          height={20}
        />
        <p>Voting starts soon</p>
      </div>
    );
  }
  if (status === ProposalState.Active) {
    if (isConnected) {
      if (hasVoted) {
        return <p>You voted</p>;
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
    return null;
  }
  if (status === ProposalState.Succeeded) {
    return (
      isConnected && (
        <Button
          className="h-[37px] rounded-[100px] focus-visible:ring-0"
          isLoading={isLoading}
          onClick={() => onClick("queue")}
        >
          Queue
        </Button>
      )
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
      <div className="flex items-center gap-4">
        <Image
          src="/assets/image/proposal/action/check.svg"
          alt="executed"
          width={20}
          height={20}
        />
        <p>Proposal executed</p>
      </div>
    );
  }
  if (status === ProposalState.Canceled) {
    return (
      <div className="flex items-center gap-4">
        <Image
          src="/assets/image/proposal/action/cancel.svg"
          alt="canceled"
          width={20}
          height={20}
        />
        <p>Proposal canceled</p>
      </div>
    );
  }
  if (status === ProposalState.Expired) {
    return (
      <div className="flex items-center gap-4">
        <Image
          src="/assets/image/proposal/action/cancel.svg"
          alt="expired"
          width={20}
          height={20}
        />
        <p>Proposal expired</p>
      </div>
    );
  }
  if (status === ProposalState.Defeated) {
    return (
      <div className="flex items-center gap-4">
        <Image
          src="/assets/image/proposal/action/cancel.svg"
          alt="defeated"
          width={20}
          height={20}
        />
        <p>Proposal defeated</p>
      </div>
    );
  }

  return null;
};
