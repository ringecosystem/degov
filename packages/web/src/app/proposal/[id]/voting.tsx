import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { AddressWithAvatarFull } from "@/components/address-with-avatar-full";
import { CloseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { VoteStatusAction } from "@/components/vote-status";
import { VoteType } from "@/config/vote";
import { useMyVotes } from "@/hooks/useMyVotes";
import { formatShortAddress } from "@/utils/address";

import type { Address } from "viem";

interface VotingProps {
  proposalId?: string;
  open: boolean;
  isPending: boolean;
  onOpenChange: (value: boolean) => void;
  address?: Address;
  onCastVote: ({
    proposalId,
    support,
    reason,
  }: {
    proposalId: string;
    support: number;
    reason: string;
  }) => void;
}

export function Voting({
  proposalId,
  open,
  onOpenChange,
  isPending,
  onCastVote,
}: VotingProps) {
  const { formattedVotes, votes, refetch, isFetching } = useMyVotes();
  const [support, setSupport] = useState<VoteType>(VoteType.For);
  const [reason, setReason] = useState("");
  const { address } = useAccount();

  useEffect(() => {
    if (!open) {
      setSupport(VoteType.For);
      setReason("");
    } else {
      refetch();
    }
  }, [open, refetch]);

  const handleCastVote = useCallback(() => {
    onCastVote({
      proposalId: proposalId as string,
      support,
      reason,
    });
  }, [onCastVote, proposalId, reason, support]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[400px] rounded-[26px] border-border/20 bg-card p-[20px] sm:rounded-[26px]">
        <DialogHeader className="flex w-full flex-row items-center justify-between">
          <DialogTitle className="text-[18px] font-bold">Voting</DialogTitle>
          <CloseIcon
            width={24}
            height={24}
            className="cursor-pointer transition-opacity hover:opacity-80"
            onClick={() => onOpenChange(false)}
          />
        </DialogHeader>
        <Separator className="my-0 bg-muted-foreground/40" />
        <div className="flex w-[360px] flex-col gap-[20px]">
          <div className="flex items-center gap-[10px]">
            <AddressWithAvatarFull
              address={address as Address}
              avatarSize={34}
            />
          </div>

          <div className="flex items-center justify-between rounded-[4px] border border-muted-foreground p-[10px]">
            <span className="text-[14px]">Voting power</span>
            {isFetching ? (
              <Skeleton className="h-[36px] w-[100px]" />
            ) : (
              <span className="text-[26px] font-semibold">
                {formattedVotes}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between rounded-[4px] border border-muted-foreground p-[10px]">
            <span className="text-[14px]">Proposal lD</span>
            <span className="text-[26px] font-semibold">
              {proposalId ? formatShortAddress(proposalId) : ""}
            </span>
          </div>

          <div className="flex flex-col gap-[5px]">
            <h4 className="text-[14px] font-normal">Vote</h4>
            <div className="flex items-center justify-between gap-[10px]">
              <VoteStatusAction
                variant={VoteType.For}
                type={support === VoteType.For ? "active" : "default"}
                className="w-[113px]"
                onChangeVote={() => setSupport(VoteType.For)}
              />
              <VoteStatusAction
                variant={VoteType.Against}
                type={support === VoteType.Against ? "active" : "default"}
                className="w-[113px]"
                onChangeVote={() => setSupport(VoteType.Against)}
              />
              <VoteStatusAction
                variant={VoteType.Abstain}
                type={support === VoteType.Abstain ? "active" : "default"}
                className="w-[113px]"
                onChangeVote={() => setSupport(VoteType.Abstain)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-[5px]">
            <h4 className="text-[14px] font-normal">Add comment</h4>
            <Textarea
              className="rounded-[10px] border border-border text--muted-foreground bg-card p-[10px]"
              placeholder="Why are you voting this way?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <Button
          className="rounded-[100px]"
          onClick={handleCastVote}
          disabled={!proposalId || !votes || votes === BigInt(0)}
          isLoading={isPending}
        >
          Submit
        </Button>
      </DialogContent>
    </Dialog>
  );
}
