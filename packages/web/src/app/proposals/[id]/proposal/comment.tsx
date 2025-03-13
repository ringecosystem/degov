import { AddressWithAvatarFull } from "@/components/address-with-avatar-full";
import { VoteStatus } from "@/components/vote-status";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import type { ProposalVoterItem } from "@/services/graphql/types";
import { formatSimpleDate } from "@/utils/date";

interface CommentProps {
  comment: ProposalVoterItem;
}

export const Comment = ({ comment }: CommentProps) => {
  const daoConfig = useDaoConfig();

  console.log("comment", comment);

  return (
    <div className="flex flex-col gap-[20px] border-b border-border/20 p-[20px] last:border-b-0">
      <div className="flex items-center justify-between gap-[10px]">
        <AddressWithAvatarFull address={comment.voter} />

        <div className="flex items-center gap-[10px]">
          <a
            href={`${daoConfig?.chain?.explorers?.[0]}/tx/${comment?.transactionHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-[14px] text-[#00BAFF]"
          >
            Voted {formatSimpleDate(comment.blockTimestamp)}
          </a>
          <VoteStatus variant={comment.support} className="h-[30px]" />
        </div>
      </div>

      <p>{comment.reason}</p>
    </div>
  );
};
