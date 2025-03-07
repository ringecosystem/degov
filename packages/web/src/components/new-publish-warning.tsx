import Image from "next/image";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Button } from "./ui/button";
import { Separator } from "./ui/separator";

interface NewPublishWarningProps {
  proposalThreshold?: string;
  votes?: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}

export function NewPublishWarning({
  proposalThreshold,
  votes,
  open,
  onOpenChange,
}: NewPublishWarningProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[400px] rounded-[26px] border-border/20 bg-card p-[20px] sm:rounded-[26px]">
        <DialogHeader className="flex w-full flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2 text-[18px] font-extrabold">
            <svg viewBox="0 0 24 25" focusable="false" className="size-5">
              <path
                d="M22.4539 21.1877L12.5834 2.85354C12.5513 2.79389 12.5037 2.74405 12.4455 2.70931C12.3874 2.67456 12.3209 2.65622 12.2532 2.65622C12.1855 2.65622 12.119 2.67456 12.0608 2.70931C12.0027 2.74405 11.955 2.79389 11.9229 2.85354L2.05061 21.1877C2.01987 21.2449 2.00448 21.309 2.00596 21.3739C2.00743 21.4388 2.02571 21.5022 2.05901 21.5579C2.09231 21.6136 2.1395 21.6597 2.19595 21.6916C2.2524 21.7236 2.31619 21.7404 2.38108 21.7404H22.1258C22.1904 21.74 22.2539 21.7229 22.3101 21.6908C22.3662 21.6586 22.4131 21.6125 22.4461 21.5569C22.4791 21.5012 22.4972 21.438 22.4986 21.3733C22.4999 21.3087 22.4845 21.2447 22.4539 21.1877ZM13.1904 19.4867H11.3155V17.6117H13.1904V19.4867ZM13.0029 16.4904H11.503L11.2217 8.99041H13.2842L13.0029 16.4904Z"
                fill="currentColor"
              ></path>
            </svg>{" "}
            Not enough voting power
          </DialogTitle>
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
        <div className="flex w-[360px] items-center justify-center gap-[20px] rounded-[10px] bg-secondary p-[20px]">
          <div className="flex flex-col gap-[10px]">
            <div className="flex flex-col  gap-[5px]">
              <span className="text-sm font-semibold">Proposal Threshold</span>
              <span className="text-sm text-muted-foreground">
                {proposalThreshold ?? "0"}
              </span>
            </div>
            <div className="flex flex-col gap-[5px]">
              <span className="text-sm font-semibold">Your Voting Power</span>
              <span className="text-sm text-muted-foreground">
                {votes ?? "0"}
              </span>
            </div>
            <p className="text-sm ">
              You won&apos;t be able to submit this proposal onchain.
            </p>
          </div>
        </div>
        <Separator className="my-0 bg-muted-foreground/40" />
        <div className="flex flex-col gap-[20px]">
          <Button
            className="w-full rounded-[100px]"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
