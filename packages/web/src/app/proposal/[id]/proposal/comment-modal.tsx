import Image from "next/image";

import { CloseIcon } from "@/components/icons";
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
  const { isAiBot } = useAiBotAddress(commentData?.voter);
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

        {isAiBot && (
          <>
            <Separator className="my-0 bg-muted-foreground/40" />
            <footer className="flex flex-col lg:flex-row items-start lg:items-center justify-between">
              <div className="flex items-center gap-[5px]">
                <span className="text-[14px] font-normal">Powered By</span>
                <Image
                  src="/assets/image/aibot.svg"
                  alt="DeGov AI Agent"
                  width={24}
                  height={24}
                />
                <span className="text-[14px] font-normal">DeGov AI Agent</span>
              </div>
              <a
                href={`/ai-analysis/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[14px] mt-2 lg:mt-0 font-semibold text-background p-[10px] rounded-[100px] bg-foreground hover:bg-foreground/80 transition-colors"
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
