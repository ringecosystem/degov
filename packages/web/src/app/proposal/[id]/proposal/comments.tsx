import type { ProposalVoterItem } from "@/services/graphql/types";

import { Comment } from "./comment";

interface CommentsProps {
  comments: ProposalVoterItem[];
}

export const Comments = ({ comments }: CommentsProps) => {
  return (
    <div className="flex flex-col gap-[20px]">
      {comments.map((comment) => (
        <Comment key={comment.id} comment={comment} />
      ))}
    </div>
  );
};
