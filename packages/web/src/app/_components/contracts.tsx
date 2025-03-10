"use client";
import Image from "next/image";

import ClipboardIconButton from "@/components/clipboard-icon-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ViewOnExplorer } from "@/components/view-on-explorer";
import { useDaoConfig } from "@/hooks/useDaoConfig";

export const Contracts = () => {
  const daoConfig = useDaoConfig();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="rounded-full border-border bg-card"
          size="sm"
        >
          Contracts
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="flex flex-col gap-[20px] rounded-[14px] border-border/20 bg-card p-[20px]"
        align="start"
      >
        <div className="flex items-center justify-between text-[16px] font-semibold text-foreground">
          <span>Contracts</span>
          <div className="flex h-[34px] w-[118px] items-center justify-center gap-[5px] rounded-[100px] bg-[#2E2E2E] px-[10px] py-[5px]">
            <Image
              src={daoConfig?.network?.logo ?? ""}
              alt="contracts"
              className="size-[24px] rounded-full"
              width={24}
              height={24}
            />
            <span className="text-[16px] font-semibold text-foreground">
              {daoConfig?.network?.name}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-[20px]">
          <div className="flex flex-col gap-[10px]">
            <span className="text-[14px] font-normal text-foreground/50">
              Governor
            </span>
            <div className="flex w-full items-center justify-between gap-[5px]">
              <span className="text-[14px] font-normal text-foreground">
                {daoConfig?.contracts?.governor}
              </span>
              <div className="flex items-center gap-[5px]">
                <ClipboardIconButton
                  text={daoConfig?.contracts?.governor}
                  size={15}
                  strokeWidth={2}
                  color="rgba(255, 255, 255, 0.5)"
                />
                <ViewOnExplorer
                  explorerUrl={`${daoConfig?.network?.explorer?.[0]}/address/${daoConfig?.contracts?.governor}`}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-[10px]">
            <span className="inline-flex items-center gap-[5px] text-[14px] font-normal text-foreground/50">
              Token
              <span className="inline-block leading-none rounded-[10px] bg-muted-foreground p-[5px] text-[#202224] text-[12px] font-semibold">
                {daoConfig?.contracts?.governorToken?.standard}
              </span>
            </span>
            <div className="flex w-full items-center justify-between gap-[5px]">
              <span className="text-[14px] font-normal text-foreground">
                {daoConfig?.contracts?.governorToken?.contract}
              </span>
              <div className="flex items-center gap-[5px]">
                <ClipboardIconButton
                  text={daoConfig?.contracts?.governorToken?.contract}
                  size={15}
                  strokeWidth={2}
                  color="rgba(255, 255, 255, 0.5)"
                />
                <ViewOnExplorer
                  explorerUrl={`${daoConfig?.network?.explorer?.[0]}/address/${daoConfig?.contracts?.governorToken?.contract}`}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-[10px]">
            <span className="text-[14px] font-normal text-foreground/50">
              TimeLock
            </span>
            <div className="flex w-full items-center justify-between gap-[5px]">
              <span className="text-[14px] font-normal text-foreground">
                {daoConfig?.contracts?.timeLock}
              </span>
              <div className="flex items-center gap-[5px]">
                <ClipboardIconButton
                  text={daoConfig?.contracts?.timeLock}
                  size={15}
                  strokeWidth={2}
                  color="rgba(255, 255, 255, 0.5)"
                />
                <ViewOnExplorer
                  explorerUrl={`${daoConfig?.network?.explorer?.[0]}/address/${daoConfig?.contracts?.timeLock}`}
                />
              </div>
            </div>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
