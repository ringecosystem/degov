import Image from "next/image";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useAiBotAddress } from "@/hooks/useAiBotAddress";
import type { ProposalVoterItem } from "@/services/graphql/types";

interface CommentModalProps {
  open: boolean;
  id?: string;
  onOpenChange: (value: boolean) => void;
  commentData?: ProposalVoterItem;
}

export function CommentModal({
  open,
  id,
  onOpenChange,
  commentData,
}: CommentModalProps) {
  const isAiBot = useAiBotAddress(commentData?.voter);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[400px] rounded-[26px] border-border/20 bg-card p-[20px] sm:rounded-[26px]">
        <DialogHeader className="flex w-full flex-row items-center justify-between">
          <DialogTitle className="text-[18px] font-normal">Comment</DialogTitle>
          <Image
            src="/assets/image/close.svg"
            alt="close"
            width={24}
            height={24}
            className="cursor-pointer transition-opacity hover:opacity-80"
            onClick={() => onOpenChange(false)}
          />
        </DialogHeader>
        <Separator className="my-0 bg-muted-foreground/40" />
        <div
          className="w-[360px] font-normal leading-normal markdown-body"
          dangerouslySetInnerHTML={{ __html: commentData?.reason ?? "" }}
        />

        {isAiBot && (
          <>
            <Separator className="my-0 bg-muted-foreground/40" />
            <footer className="flex flex-row items-center justify-between">
              <div></div>
              <a
                href={`/ai-analysis/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[14px] font-normal text-primary"
              >
                Decision Details
              </a>
            </footer>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
