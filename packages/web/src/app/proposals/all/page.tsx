"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { ProposalsTable } from "@/components/proposals-table";
import { Button } from "@/components/ui/button";

export default function Proposals() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-[30px]">
      <div className="flex items-center justify-between gap-[20px]">
        <h3 className="text-[18px] font-extrabold">All Proposals</h3>

        <div className="flex items-center gap-[20px]">
          <Button
            className="flex items-center gap-[5px] rounded-[100px]"
            onClick={() => router.push("/proposals/new")}
          >
            <Image
              src="/assets/image/plus.svg"
              alt="plus"
              width={20}
              height={20}
              className="size-[20px]"
            />
            New Proposal
          </Button>
        </div>
      </div>
      <ProposalsTable type="all" />
    </div>
  );
}
