"use client";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAccount } from "wagmi";

import { Faqs } from "@/components/faqs";
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

import type { CheckedState } from "@radix-ui/react-checkbox";

function ProposalsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const supportParam = searchParams.get("support");
  const addressParam = searchParams.get("address");

  const [support, setSupport] = useState<"all" | "1" | "2" | "3">(
    (supportParam as "all" | "1" | "2" | "3") || "all"
  );
  const { isConnected, address } = useAccount();

  const [isMyProposals, setIsMyProposals] = useState<CheckedState>(
    typeParam === "my"
  );

  // Update URL when filters change
  const updateUrlParams = (myProposals: boolean, supportValue: string) => {
    const params = new URLSearchParams(searchParams);

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

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex items-center justify-between gap-[20px]">
        <h3 className="text-[18px] font-extrabold">Onchain Proposals</h3>

        <div className="flex items-center gap-[20px]">
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
                <SelectTrigger className="w-[130px] rounded-[100px] border border-border px-[10px]">
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
      <div className="flex items-start gap-[10px]">
        <div className="flex-1">
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
        <div className="w-[360px] flex flex-col gap-[20px]">
          <SystemInfo type="proposal" />
          <Faqs type="general" />
        </div>
      </div>
    </div>
  );
}

export default function Proposals() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-[30px]">
          <div className="flex items-center justify-between gap-[20px]">
            <h3 className="text-[18px] font-extrabold">Onchain Proposals</h3>
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
