"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { ProposalsTable } from "@/components/proposals-table";
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

export default function Proposals() {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-[30px] p-[30px]">
      <div className="flex items-center justify-between gap-[20px]">
        <h3 className="text-[18px] font-extrabold">Onchain Proposals</h3>

        <div className="flex items-center gap-[20px]">
          <div className="flex items-center space-x-2">
            <Checkbox id="my-proposals" />
            <label
              htmlFor="my-proposals"
              className="cursor-pointer text-[14px] font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              My Proposals
            </label>
          </div>
          <Select>
            <SelectTrigger className="w-[130px] rounded-[100px] border border-border px-[10px]">
              <SelectValue placeholder="Select Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Active</SelectItem>
                <SelectItem value="succeeded">Succeeded</SelectItem>
                <SelectItem value="executed">Executed</SelectItem>
                <SelectItem value="defeated">Defeated</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
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
