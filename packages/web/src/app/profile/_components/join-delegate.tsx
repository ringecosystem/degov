import { useCallback, useState } from "react";
import { useAccount } from "wagmi";

import { CloseIcon } from "@/components/icons";
import { TransactionToast } from "@/components/transaction-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useDelegate } from "@/hooks/useDelegate";

interface JoinDelegateProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  amount: number | string;
  symbol: string;
}

export function JoinDelegate({
  open,
  onOpenChange,
  amount,
  symbol,
}: JoinDelegateProps) {
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
              Join as Delegate
            </DialogTitle>
            <CloseIcon
              width={24}
              height={24}
              className="cursor-pointer transition-opacity hover:opacity-80"
              onClick={() => onOpenChange(false)}
            />
          </DialogHeader>
          <Separator className="my-0 bg-muted-foreground/40" />
          <p className="text-[14px] text-foreground font-semibold">
            You are going to participate in the delegation by converting your{" "}
            {amount} {symbol} to voting power. Please continue if you want to
            proceed.
          </p>
          <Separator className="my-0 bg-muted-foreground/40" />
          <div className="grid grid-cols-2 gap-[20px]">
            <Button
              className=" rounded-[100px] border-border bg-card"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              className="w-full rounded-[100px]"
              isLoading={isPendingDelegate}
              onClick={handleDelegate}
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {hash && <TransactionToast hash={hash as `0x${string}`} />}
    </>
  );
}
