"use client";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useDebounce } from "react-use";
import { useAccount } from "wagmi";

import { DelegateAction } from "@/components/delegate-action";
import { Faqs } from "@/components/faqs";
import { MembersTable } from "@/components/members-table";
import { SystemInfo } from "@/components/system-info";
import { Input } from "@/components/ui/input";
import { WithConnect } from "@/components/with-connect";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { proposalService } from "@/services/graphql";
import type { ContributorItem } from "@/services/graphql/types";

import type { Address } from "viem";

export default function Members() {
  const { isConnected } = useAccount();
  const daoConfig = useDaoConfig();
  const [address, setAddress] = useState<Address | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [showConnectPrompt, setShowConnectPrompt] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  // Debounce search term
  useDebounce(
    () => {
      setDebouncedSearchTerm(searchTerm);
    },
    300,
    [searchTerm]
  );

  // Get proposal metrics (including member count)
  const { data: proposalMetrics } = useQuery({
    queryKey: ["proposalMetrics", daoConfig?.indexer?.endpoint],
    queryFn: () =>
      proposalService.getProposalMetrics(
        daoConfig?.indexer?.endpoint as string
      ),
    enabled: !!daoConfig?.indexer?.endpoint,
  });

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

  const getDisplayTitle = () => {
    const totalCount = proposalMetrics?.memberCount;
    if (totalCount !== undefined) {
      return `Delegates (${totalCount})`;
    }
    return "Delegates";
  };

  if (showConnectPrompt) {
    return (
      <WithConnect>
        <div className="flex flex-col gap-[20px]">
          <div className="flex items-center justify-between gap-[20px]">
            <h3 className="text-[18px] font-extrabold">{getDisplayTitle()}</h3>
            <div className="flex h-[36px] w-[388px] items-center gap-[13px] rounded-[20px] border px-[17px] transition-all border-border bg-card">
              <Search className="h-[15px] w-[15px] text-foreground/50" />
              <Input
                placeholder="Search address"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-full flex-1 appearance-none bg-transparent outline-none border-none focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
              />
            </div>
          </div>
          <div className="flex items-start gap-[10px]">
            <div className="flex-1">
              <MembersTable
                onDelegate={handleDelegate}
                searchTerm={debouncedSearchTerm}
              />
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
            <h3 className="text-[18px] font-extrabold">{getDisplayTitle()}</h3>
            <div className="flex h-[36px] w-[388px] items-center gap-[13px] rounded-[20px] border px-[17px] transition-all border-border bg-card">
              <Search className="h-[15px] w-[15px] text-foreground/50" />
              <Input
                placeholder="Search address or name"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-full flex-1 appearance-none bg-transparent outline-none border-none focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
              />
            </div>
          </div>
          <MembersTable
            onDelegate={handleDelegate}
            searchTerm={debouncedSearchTerm}
          />
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
