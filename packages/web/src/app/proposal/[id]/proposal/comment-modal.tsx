import Image from "next/image";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

interface CommentModalProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  comment?: string;
}

export function CommentModal({
  open,
  onOpenChange,
  comment,
}: CommentModalProps) {
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
          className="w-[360px] font-normal leading-normal"
          dangerouslySetInnerHTML={{ __html: comment ?? "" }}
        />
      </DialogContent>
    </Dialog>
  );
}
