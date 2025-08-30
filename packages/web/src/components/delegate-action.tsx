import { useCallback, useState } from "react";
import { toast } from "react-toastify";
import { useAccount, useReadContract } from "wagmi";

import { CloseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { abi as tokenAbi } from "@/config/abi/token";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useDelegate } from "@/hooks/useDelegate";
import { useGovernanceToken } from "@/hooks/useGovernanceToken";
import { formatBigIntForDisplay } from "@/utils/number";

import { AddressWithAvatar } from "./address-with-avatar";
import { TransactionToast } from "./transaction-toast";
import { Separator } from "./ui/separator";

import type { Address } from "viem";

interface DelegateActionProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  address?: Address;
}

export function DelegateAction({
  open,
  onOpenChange,
  address,
}: DelegateActionProps) {
  const daoConfig = useDaoConfig();
  const [hash, setHash] = useState<string | null>(null);
  const { address: account } = useAccount();
  const { data: governanceToken, isLoading: isLoadingGovernanceToken } =
    useGovernanceToken();

  const { data: tokenBalance, isLoading: isLoadingTokenBalance } =
    useReadContract({
      address: daoConfig?.contracts?.governorToken?.address as `0x${string}`,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [account as `0x${string}`],
      chainId: daoConfig?.chain?.id,
      query: {
        enabled:
          !!account &&
          !!daoConfig?.contracts?.governorToken?.address &&
          !!daoConfig?.chain?.id,
      },
    });

  const { delegate, isPending: isPendingDelegate } = useDelegate();

  const handleDelegate = useCallback(async () => {
    try {
      const hash = await delegate(address as Address);
      if (hash) {
        onOpenChange?.(false);
        setHash(hash);
      }
    } catch (error) {
      toast.error(
        (error as { shortMessage: string })?.shortMessage ??
          "Failed to delegate votes"
      );
    }
  }, [address, delegate, onOpenChange]);

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
              className="cursor-pointer transition-opacity hover:opacity-80"
              onClick={() => onOpenChange(false)}
            />
          </DialogHeader>
          <Separator className="my-0 bg-muted-foreground/40" />
          <div className="flex h-[87px] w-[360px] items-center justify-center gap-[20px] rounded-[10px] bg-card-background p-[20px]">
            <AddressWithAvatar
              address={address ?? "0x0000000000000000000000000000000000000000"}
              avatarSize={40}
              textClassName="text-[18px] font-semibold"
            />
          </div>
          <Separator className="my-0 bg-muted-foreground/40" />
          <div className="flex flex-col gap-[20px]">
            <Button
              className="w-full rounded-[100px]"
              isLoading={
                isLoadingTokenBalance ||
                isLoadingGovernanceToken ||
                isPendingDelegate
              }
              onClick={handleDelegate}
            >
              Delegate votes{" "}
              {tokenBalance
                ? formatBigIntForDisplay(
                    tokenBalance,
                    governanceToken?.decimals ?? 18
                  )
                : 0}{" "}
              {governanceToken?.symbol}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {hash && <TransactionToast hash={hash as `0x${string}`} />}
    </>
  );
}
