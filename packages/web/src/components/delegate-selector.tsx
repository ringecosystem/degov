import { useCallback, useState } from "react";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDelegate } from "@/hooks/useDelegate";

import { CloseIcon } from "./icons";
import { TransactionToast } from "./transaction-toast";
import { Separator } from "./ui/separator";

interface DelegateSelectorProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onSelect: (value: "myself" | "else") => void;
}

export function DelegateSelector({
  open,
  onOpenChange,
  onSelect,
}: DelegateSelectorProps) {
  const { delegate, isPending: isPendingDelegate } = useDelegate();
  const { address } = useAccount();
  const [hash, setHash] = useState<string | null>(null);
  const handleDelegate = useCallback(async () => {
    if (!address) return;
    const hash = await delegate(address);
    if (hash) {
      onOpenChange?.(false);
      setHash(hash);
    }
  }, [delegate, onOpenChange, address]);
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[400px] rounded-[26px] border-border/20 bg-card p-[20px] sm:rounded-[26px]">
          <DialogHeader className="flex w-full flex-row items-center justify-between">
            <DialogTitle className="text-[18px] font-extrabold">
              Delegate
            </DialogTitle>
            <CloseIcon
              width={24}
              height={24}
              className="cursor-pointer transition-opacity hover:opacity-80 text-foreground"
              onClick={() => onOpenChange(false)}
            />
          </DialogHeader>
          <Separator className="my-0 bg-muted-foreground/40" />
          <div className="flex flex-col gap-[20px]">
            <Button
              className="w-full rounded-[100px] border-border bg-card"
              variant="outline"
              isLoading={isPendingDelegate}
              onClick={handleDelegate}
            >
              Myself
            </Button>
            <Button
              className="w-full rounded-[100px] border-border bg-card"
              variant="outline"
              onClick={() => onSelect("else")}
            >
              Someone else
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {hash && <TransactionToast hash={hash as `0x${string}`} />}
    </>
  );
}
