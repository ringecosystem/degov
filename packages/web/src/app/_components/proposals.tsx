"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useAccount } from "wagmi";

import { Faqs } from "@/components/faqs";
import { NewPublishWarning } from "@/components/new-publish-warning";
import { ProposalsList } from "@/components/proposals-list";
import { ProposalsTable } from "@/components/proposals-table";
import { Button } from "@/components/ui/button";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useMyVotes } from "@/hooks/useMyVotes";

export const Proposals = () => {
  const daoConfig = useDaoConfig();
  const router = useRouter();
  const { isConnected } = useAccount();
  const [publishWarningOpen, setPublishWarningOpen] = useState(false);

  const { hasEnoughVotes, proposalThreshold, votes } = useMyVotes();

  const handleNewProposalClick = useCallback(() => {
    if (isConnected && !hasEnoughVotes) {
      setPublishWarningOpen(true);
      return;
    }

    router.push("/proposals/new");
  }, [isConnected, hasEnoughVotes, router]);

  return (
    <div className="flex flex-col gap-[15px] lg:gap-[20px]">
      <div className="flex flex-col lg:flex-row lg:items-start gap-[15px] lg:gap-[20px]">
        <div className="flex-1 flex flex-col gap-[8px] lg:gap-[10px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-[10px] sm:gap-0">
            <h3 className="text-[16px] lg:text-[18px] font-extrabold">
              Proposals
            </h3>
            <div className="items-center gap-[8px] lg:gap-[10px] flex-wrap hidden lg:flex">
              {daoConfig?.offChainDiscussionUrl ? (
                <Button
                  className="rounded-[100px] cursor-pointer text-[13px] lg:text-sm"
                  asChild
                >
                  <Link
                    href={daoConfig?.offChainDiscussionUrl}
                    className="flex items-center gap-[4px] lg:gap-[5px]"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Image
                      src="/assets/image/light/discussion.svg"
                      alt="plus"
                      width={16}
                      height={16}
                      className="dark:hidden size-[16px] lg:size-[20px]"
                    />
                    <Image
                      src="/assets/image/discussion.svg"
                      alt="plus"
                      width={16}
                      height={16}
                      className="hidden dark:block size-[16px] lg:size-[20px]"
                    />
                    <span className="hidden sm:inline">Join Discussion</span>
                    <span className="sm:hidden">Discussion</span>
                  </Link>
                </Button>
              ) : null}
              <Button
                className="flex items-center gap-[4px] lg:gap-[5px] rounded-[100px] text-[13px] lg:text-sm"
                onClick={handleNewProposalClick}
              >
                <Image
                  src="/assets/image/light/plus.svg"
                  alt="plus"
                  width={16}
                  height={16}
                  className="size-[16px] lg:size-[20px] block dark:hidden"
                />
                <Image
                  src="/assets/image/plus.svg"
                  alt="plus"
                  width={16}
                  height={16}
                  className="size-[16px] lg:size-[20px] hidden dark:block"
                />
                <span className="hidden sm:inline">New Proposal</span>
                <span className="sm:hidden">New</span>
              </Button>
            </div>
          </div>
          <div className="lg:hidden">
            <ProposalsList type="active" />
          </div>
          <div className="hidden lg:block">
            <ProposalsTable type="active" />
          </div>
        </div>
        <Faqs type="general" />
      </div>

      <NewPublishWarning
        open={publishWarningOpen}
        onOpenChange={setPublishWarningOpen}
        proposalThreshold={proposalThreshold}
        votes={votes}
      />
    </div>
  );
};
