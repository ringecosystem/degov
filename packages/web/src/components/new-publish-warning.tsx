import { useMemo } from "react";

import { CloseIcon } from "@/components/icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";

import { Button } from "./ui/button";

interface NewPublishWarningProps {
  proposalThreshold?: bigint;
  votes?: bigint;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}

export function NewPublishWarning({
  proposalThreshold,
  votes,
  open,
  onOpenChange,
}: NewPublishWarningProps) {
  const formatTokenAmount = useFormatGovernanceTokenAmount();

  const formattedData = useMemo(() => {
    const threshold = proposalThreshold ?? 0n;
    const userVotes = votes ?? 0n;

    const needed = threshold > userVotes ? threshold - userVotes : 0n;

    return {
      formattedProposalThreshold:
        formatTokenAmount(threshold)?.formatted ?? "0",
      formattedVotes: formatTokenAmount(userVotes)?.formatted ?? "0",
      formattedVotingPowerNeeded: formatTokenAmount(needed)?.formatted ?? "0",
    };
  }, [proposalThreshold, votes, formatTokenAmount]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[400px] rounded-[26px] border-border/20 bg-card p-[20px] sm:rounded-[26px] flex flex-col gap-[20px]">
        <DialogHeader className="flex w-full flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2 text-[18px] font-extrabold">
            <svg viewBox="0 0 24 25" focusable="false" className="size-5">
              <path
                d="M22.4539 21.1877L12.5834 2.85354C12.5513 2.79389 12.5037 2.74405 12.4455 2.70931C12.3874 2.67456 12.3209 2.65622 12.2532 2.65622C12.1855 2.65622 12.119 2.67456 12.0608 2.70931C12.0027 2.74405 11.955 2.79389 11.9229 2.85354L2.05061 21.1877C2.01987 21.2449 2.00448 21.309 2.00596 21.3739C2.00743 21.4388 2.02571 21.5022 2.05901 21.5579C2.09231 21.6136 2.1395 21.6597 2.19595 21.6916C2.2524 21.7236 2.31619 21.7404 2.38108 21.7404H22.1258C22.1904 21.74 22.2539 21.7229 22.3101 21.6908C22.3662 21.6586 22.4131 21.6125 22.4461 21.5569C22.4791 21.5012 22.4972 21.438 22.4986 21.3733C22.4999 21.3087 22.4845 21.2447 22.4539 21.1877ZM13.1904 19.4867H11.3155V17.6117H13.1904V19.4867ZM13.0029 16.4904H11.503L11.2217 8.99041H13.2842L13.0029 16.4904Z"
                fill="currentColor"
              ></path>
            </svg>{" "}
            Inefficient Voting Power
          </DialogTitle>
          <CloseIcon
            width={24}
            height={24}
            className="cursor-pointer transition-opacity hover:opacity-80"
            onClick={() => onOpenChange(false)}
          />
        </DialogHeader>

        <div className="flex flex-col gap-[20px] border-t border-border/50 pt-[20px]">
          {/* Required Voting Power Section */}
          <div className="flex items-center justify-between rounded-[10px] bg-card-background p-[20px]">
            <span className="text-[14px] font-normal text-foreground">
              Required Voting Power
            </span>
            <span className="text-[26px] font-semibold text-foreground">
              {formattedData.formattedProposalThreshold}
            </span>
          </div>

          {/* Your Voting Power Section */}
          <div className="flex items-center justify-between rounded-[10px] bg-card-background p-[20px]">
            <span className="text-[14px] font-normal text-foreground">
              Your Voting Power
            </span>
            <span className="text-[26px] font-semibold text-foreground">
              {formattedData.formattedVotes}
            </span>
          </div>

          {/* Need more voting power message */}
          <p className="text-[14px] text-foreground">
            Need {formattedData.formattedVotingPowerNeeded} more Voting Power to
            create the proposal.
          </p>

          <div className="flex flex-col gap-[20px] border-t border-border/50 pt-[20px]">
            <Button
              className="w-full rounded-[100px]"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              OK
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
