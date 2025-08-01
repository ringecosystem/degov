"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Faqs } from "@/components/faqs";
import { ProposalsTable } from "@/components/proposals-table";
import { Button } from "@/components/ui/button";
import { useDaoConfig } from "@/hooks/useDaoConfig";

export const Proposals = () => {
  const daoConfig = useDaoConfig();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex items-start gap-[20px]">
        <div className="flex-1 flex flex-col gap-[10px]">
          <div className="flex items-center justify-between">
            <h3 className="text-[18px] font-extrabold">Proposals</h3>
            <div className="flex items-center gap-[10px]">
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
                    Join Discussion
                  </Link>
                </Button>
              ) : null}
              <Button
                className="flex items-center gap-[5px] rounded-[100px]"
                onClick={() => router.push("/proposals/new")}
              >
                <Image
                  src="/assets/image/light/plus.svg"
                  alt="plus"
                  width={20}
                  height={20}
                  className="size-[20px] block dark:hidden"
                />
                <Image
                  src="/assets/image/plus.svg"
                  alt="plus"
                  width={20}
                  height={20}
                  className="size-[20px] hidden dark:block"
                />
                New Proposal
              </Button>
            </div>
          </div>
          <ProposalsTable type="active" />
        </div>
        <Faqs type="general" />
      </div>
    </div>
  );
};
