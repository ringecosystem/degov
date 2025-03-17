"use client";
import { useCallback, useEffect, useState } from "react";

import { DelegateAction } from "@/components/delegate-action";
import { MembersTable } from "@/components/members-table";
import type { ContributorItem } from "@/services/graphql/types";

import type { Address } from "viem";

export default function Members() {
  const [address, setAddress] = useState<Address | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const handleDelegate = useCallback((value: ContributorItem) => {
    setAddress(value?.id as `0x${string}`);
    setOpen(true);
  }, []);

  useEffect(() => {
    return () => {
      setAddress(undefined);
      setOpen(false);
    };
  }, []);

  return (
    <div className="flex flex-col gap-[30px]">
      <div className="flex items-center justify-between gap-[20px]">
        <h3 className="text-[18px] font-extrabold">Members</h3>
      </div>
      <MembersTable onDelegate={handleDelegate} />
      <DelegateAction address={address} open={open} onOpenChange={setOpen} />
    </div>
  );
}
