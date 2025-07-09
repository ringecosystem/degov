"use client";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { DelegateAction } from "@/components/delegate-action";
import { Faqs } from "@/components/faqs";
import { MembersTable } from "@/components/members-table";
import { SystemInfo } from "@/components/system-info";
import { WithConnect } from "@/components/with-connect";
import type { ContributorItem } from "@/services/graphql/types";

import type { Address } from "viem";

export default function Members() {
  const { isConnected } = useAccount();
  const [address, setAddress] = useState<Address | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [showConnectPrompt, setShowConnectPrompt] = useState(false);

  const handleDelegate = useCallback(
    (value: ContributorItem) => {
      if (!isConnected) {
        setShowConnectPrompt(true);
        return;
      }

      setAddress(value?.id as `0x${string}`);
      setOpen(true);
    },
    [isConnected]
  );

  useEffect(() => {
    if (isConnected) {
      setShowConnectPrompt(false);
    }
  }, [isConnected]);

  useEffect(() => {
    return () => {
      setAddress(undefined);
      setOpen(false);
      setShowConnectPrompt(false);
    };
  }, []);

  if (showConnectPrompt) {
    return (
      <WithConnect>
        <div className="flex flex-col gap-[20px]">
          <div className="flex items-center justify-between gap-[20px]">
            <h3 className="text-[18px] font-extrabold">Delegates</h3>
          </div>
          <div className="flex items-start gap-[10px]">
            <div className="flex-1">
              <MembersTable onDelegate={handleDelegate} />
            </div>
            <div className="flex flex-col gap-[20px]">
              <SystemInfo />
              <Faqs type="delegate" />
            </div>
          </div>
        </div>
      </WithConnect>
    );
  }

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex items-start gap-[20px]">
        <div className="flex-1 flex flex-col gap-[20px]">
          <div className="flex items-center justify-between gap-[20px]">
            <h3 className="text-[18px] font-extrabold">Delegates</h3>
          </div>
          <MembersTable onDelegate={handleDelegate} />
        </div>
        <div className="flex flex-col gap-[20px]">
          <SystemInfo />
          <Faqs type="delegate" />
        </div>
      </div>
      <DelegateAction address={address} open={open} onOpenChange={setOpen} />
    </div>
  );
}
