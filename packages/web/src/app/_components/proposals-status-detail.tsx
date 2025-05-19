"use client";
import Image from "next/image";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const ProposalsStatusDetail = () => {
  const [items] = useState<
    {
      title: string;
      count: number;
      color: string;
    }[]
  >([
    { title: "Pending", count: 4, color: "bg-pending" },
    { title: "Active", count: 4, color: "bg-active" },
    { title: "Succeeded", count: 4, color: "bg-succeeded" },
    { title: "Executed", count: 4, color: "bg-executed" },
    { title: "Defeated", count: 4, color: "bg-defeated" },
    { title: "Canceled", count: 4, color: "bg-canceled" },
  ]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Image
          src="/assets/image/info.svg"
          alt="info"
          className="size-[16px] cursor-pointer transition-opacity hover:opacity-80"
          width={16}
          height={16}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[220px] gap-[20px] rounded-[14px] border-none p-[20px] shadow-2xl">
        <div className="flex flex-col gap-[20px]">
          {items?.map((item) => {
            return (
              <div
                className="flex items-center justify-between gap-[10px]"
                key={item.title}
              >
                <div className="flex items-center gap-[10px]">
                  <span
                    className={`size-[10px] rounded-full ${item.color}`}
                  ></span>
                  <span className="text-[14px] text-foreground/50">
                    {item.title}
                  </span>
                </div>
                <span className="text-[14px]">{item.count}</span>
              </div>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
