import { CloseIcon } from "@/components/icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { ProposalVoterItem } from "@/services/graphql/types";

interface CommentModalProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  commentData?: ProposalVoterItem;
}

export function CommentModal({
  open,
  onOpenChange,
  commentData,
}: CommentModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90%] lg:w-[700px] rounded-[26px] border-border/20 bg-card p-[20px] sm:rounded-[26px] sm:max-w-[700px]">
        <DialogHeader className="flex w-full flex-row items-center justify-between">
          <DialogTitle className="text-[18px] font-semibold">
            Comment
          </DialogTitle>
          <CloseIcon
            width={24}
            height={24}
            className="cursor-pointer transition-opacity hover:opacity-80"
            onClick={() => onOpenChange(false)}
          />
        </DialogHeader>
        <Separator className="my-0 bg-muted-foreground/40" />
        <div
          className="font-normal leading-normal markdown-body"
          dangerouslySetInnerHTML={{ __html: commentData?.reason ?? "" }}
        />
      </DialogContent>
    </Dialog>
  );
}
