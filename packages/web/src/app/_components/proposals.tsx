"use client";

import Image from "next/image";
import Link from "next/link";

import { ProposalsTable } from "@/components/proposals-table";
import { Button } from "@/components/ui/button";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { Faqs } from "@/components/faqs";

export const Proposals = () => {
  const daoConfig = useDaoConfig();

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex items-center justify-between">
        <h3 className="text-[18px] font-extrabold">Proposals</h3>
        {daoConfig?.offChainDiscussionUrl ? (
          <Button className="rounded-[100px] cursor-pointer" asChild>
            <Link
              href={daoConfig?.offChainDiscussionUrl}
              className="flex items-center gap-[5px]"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Image
                src="/assets/image/light/discussion.svg"
                alt="plus"
                width={20}
                height={20}
                className="dark:hidden"
              />
              <Image
                src="/assets/image/discussion.svg"
                alt="plus"
                width={20}
                height={20}
                className="hidden dark:block"
              />
              Join the Discussion
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="flex items-start gap-[10px]">
        <ProposalsTable type="active" />
        <Faqs type="general" />
      </div>
    </div>
  );
};
