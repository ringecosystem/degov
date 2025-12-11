"use client";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { useAccount } from "wagmi";

import { Faqs } from "@/components/faqs";
import { PlusIcon } from "@/components/icons";
import { NewPublishWarning } from "@/components/new-publish-warning";
import { ProposalsList } from "@/components/proposals-list";
import { ProposalsTable } from "@/components/proposals-table";
import { SystemInfo } from "@/components/system-info";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useMyVotes } from "@/hooks/useMyVotes";
import { proposalService } from "@/services/graphql";

import type { CheckedState } from "@radix-ui/react-checkbox";

function ProposalsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams?.get("type");
  const supportParam = searchParams?.get("support");
  const addressParam = searchParams?.get("address");
  const daoConfig = useDaoConfig();

  const [support, setSupport] = useState<"all" | "1" | "2" | "3">(
    (supportParam as "all" | "1" | "2" | "3") || "all"
  );
  const { isConnected, address } = useAccount();
  const [publishWarningOpen, setPublishWarningOpen] = useState(false);

  const [isMyProposals, setIsMyProposals] = useState<CheckedState>(
    typeParam === "my"
  );

  // Get voting power information
  const { hasEnoughVotes, proposalThreshold, votes } = useMyVotes();

  // Get proposal metrics (including total count)
  const { data: proposalMetrics } = useQuery({
    queryKey: ["proposalMetrics", daoConfig?.indexer?.endpoint],
    queryFn: () =>
      proposalService.getProposalMetrics(
        daoConfig?.indexer?.endpoint as string
      ),
    enabled: !!daoConfig?.indexer?.endpoint,
  });

  // Update URL when filters change
  const updateUrlParams = (myProposals: boolean, supportValue: string) => {
    const params = new URLSearchParams(searchParams || undefined);

    if (myProposals) {
      params.set("type", "my");
      // Remove address param when using "my proposals"
      params.delete("address");
    } else {
      params.delete("type");
      // Keep address param if it exists in URL
      if (addressParam) {
        params.set("address", addressParam);
      }
    }

    if (supportValue !== "all") {
      params.set("support", supportValue);
    } else {
      params.delete("support");
    }

    router.replace(`/proposals?${params.toString()}`);
  };

  const handleMyProposalsChange = (checked: CheckedState) => {
    setIsMyProposals(checked);
    updateUrlParams(!!checked, support);
  };

  const handleSupportChange = (value: "all" | "1" | "2" | "3") => {
    setSupport(value);
    updateUrlParams(!!isMyProposals, value);
  };

  const getDisplayTitle = () => {
    const totalCount = proposalMetrics?.proposalsCount
      ? parseInt(proposalMetrics.proposalsCount)
      : null;
    if (totalCount !== null) {
      return `All Proposals (${totalCount})`;
    }

    return "All Proposals";
  };

  const handleNewProposalClick = useCallback(() => {
    if (isConnected && !hasEnoughVotes) {
      setPublishWarningOpen(true);
      return;
    }

    router.push("/proposals/new");
  }, [isConnected, hasEnoughVotes, router]);

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex items-start gap-[20px]">
        <div className="flex-1 flex flex-col gap-[20px]">
          <div className="flex items-start lg:items-center flex-col lg:flex-row justify-between gap-[20px]">
            <h3 className="text-[18px] font-extrabold">{getDisplayTitle()}</h3>

            <div className="flex items-center gap-[20px] w-full lg:w-auto">
              {isConnected && (
                <>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="my-proposals"
                      checked={isMyProposals}
                      onCheckedChange={handleMyProposalsChange}
                    />
                    <label
                      htmlFor="my-proposals"
                      className="cursor-pointer text-[14px] font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      My Proposals
                    </label>
                  </div>
                  <Select
                    value={support}
                    onValueChange={handleSupportChange}
                    disabled={!isMyProposals}
                  >
                    <SelectTrigger className="w-auto flex-1 lg:w-[130px] rounded-[100px] border border-border px-[10px]">
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="1">Vote For</SelectItem>
                        <SelectItem value="0">Vote Against</SelectItem>
                        <SelectItem value="2">Vote Abstain</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </>
              )}

              <div className="hidden lg:block">
                <Button
                  className="flex items-center gap-[5px] rounded-[100px]"
                  onClick={handleNewProposalClick}
                >
                  <PlusIcon
                    width={20}
                    height={20}
                    className="size-[20px] text-current"
                  />
                  New Proposal
                </Button>
              </div>
            </div>
          </div>
          <div className="lg:hidden">
            <ProposalsList
              type="all"
              address={
                isMyProposals
                  ? address
                  : (addressParam as `0x${string}` | undefined)
              }
              support={support === "all" ? undefined : support}
            />
          </div>
          <div className="hidden lg:block">
            <ProposalsTable
              type="all"
              address={
                isMyProposals
                  ? address
                  : (addressParam as `0x${string}` | undefined)
              }
              support={support === "all" ? undefined : support}
            />
          </div>
        </div>
        <div className="w-[360px] hidden lg:flex flex-col gap-[20px]">
          <SystemInfo type="proposal" />
          <Faqs type="proposal" />
        </div>
      </div>

      {/* Insufficient Voting Power Warning Dialog */}
      <NewPublishWarning
        open={publishWarningOpen}
        onOpenChange={setPublishWarningOpen}
        proposalThreshold={proposalThreshold}
        votes={votes}
      />
    </div>
  );
}

export default function Proposals() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-[30px]">
          <div className="flex items-center justify-between gap-[20px]">
            <h3 className="text-[18px] font-extrabold">All Proposals</h3>
            <div className="w-[300px] h-[40px] animate-pulse bg-gray-700 rounded-[100px]"></div>
          </div>
          <div className="w-full h-[400px] animate-pulse bg-gray-800 rounded-md"></div>
        </div>
      }
    >
      <ProposalsContent />
    </Suspense>
  );
}
