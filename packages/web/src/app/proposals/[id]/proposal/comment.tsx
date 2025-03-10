import { AddressWithAvatarFull } from "@/components/address-with-avatar-full";
import { VoteStatus } from "@/components/vote-status";
import type { ProposalVoterItem } from "@/services/graphql/types";
import { formatSimpleDate } from "@/utils/date";

interface CommentProps {
  comment: ProposalVoterItem;
}

export const Comment = ({ comment }: CommentProps) => {
  return (
    <div className="flex flex-col gap-[20px] border-b border-border/20 p-[20px]">
      <div className="flex items-center justify-between gap-[10px]">
        <AddressWithAvatarFull address={comment.voter} />

        <div className="flex items-center gap-[10px]">
          <span className="text-[14px] text-white/50">
            Voted {formatSimpleDate(comment.blockTimestamp)}
          </span>
          <VoteStatus variant={comment.support} className="h-[30px]" />
        </div>
      </div>

      <p>{comment.reason}</p>
    </div>
  );
};
