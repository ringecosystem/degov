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
          className="rounded-full border-always-light bg-transparent text-always-light hover:bg-transparent hover:text-always-light hover:opacity-80 duration-300 transition-opacity"
          size="sm"
        >
          Contracts
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="flex flex-col gap-[20px] rounded-[14px] border-border/20 bg-card p-[20px] lg:max-w-[100vw] lg:w-auto w-[90vw] mr-[5vw] lg:mr-0"
        align="start"
      >
        <div className="flex items-center justify-between text-[16px] font-semibold text-foreground">
          <span>Contracts</span>
          <div className="flex h-[34px]  items-center justify-center gap-[5px] rounded-[100px] bg-card-background px-[10px] py-[5px]">
            <Image
              src={daoConfig?.chain?.logo ?? ""}
              alt="contracts"
              className="size-[24px] rounded-full"
              width={24}
              height={24}
            />
            <span className="text-[16px] font-semibold text-foreground">
              {daoConfig?.chain?.name}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-[20px]">
          <div className="flex flex-col gap-[10px]">
            <span className="text-[14px] font-normal text-foreground/50">
              Governor
            </span>
            <div className="flex flex-row  lg:items-center lg:justify-between gap-[10px] lg:gap-[5px]">
              <span className="text-[14px] font-normal text-foreground font-mono break-all">
                {daoConfig?.contracts?.governor}
              </span>
              <div className="flex items-center gap-[5px] self-start lg:self-auto">
                <ClipboardIconButton
                  text={daoConfig?.contracts?.governor}
                  size={15}
                  strokeWidth={2}
                />
                <ViewOnExplorer
                  explorerUrl={`${daoConfig?.chain?.explorers?.[0]}/address/${daoConfig?.contracts?.governor}`}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-[10px]">
            <span className="inline-flex items-center gap-[5px] text-[14px] font-normal text-foreground/50">
              Governor Token
              <span className="inline-block leading-none rounded-[10px] bg-muted-foreground p-[5px] text-card text-[12px] font-semibold">
                {daoConfig?.contracts?.governorToken?.standard}
              </span>
            </span>
            <div className="flex flex-row lg:items-center lg:justify-between gap-[10px] lg:gap-[5px]">
              <span className="text-[14px] font-normal text-foreground font-mono break-all">
                {daoConfig?.contracts?.governorToken?.address}
              </span>
              <div className="flex items-center gap-[5px] self-start lg:self-auto">
                <ClipboardIconButton
                  text={daoConfig?.contracts?.governorToken?.address}
                  size={15}
                  strokeWidth={2}
                />
                <ViewOnExplorer
                  explorerUrl={`${daoConfig?.chain?.explorers?.[0]}/address/${daoConfig?.contracts?.governorToken?.address}`}
                />
              </div>
            </div>
          </div>

          {daoConfig?.contracts?.timeLock && (
            <div className="flex flex-col gap-[10px]">
              <span className="text-[14px] font-normal text-foreground/50">
                TimeLock
              </span>
              <div className="flex flex-row lg:items-center lg:justify-between gap-[10px] lg:gap-[5px]">
                <span className="text-[14px] font-normal text-foreground font-mono break-all">
                  {daoConfig?.contracts?.timeLock}
                </span>
                <div className="flex items-center gap-[5px] self-start lg:self-auto">
                  <ClipboardIconButton
                    text={daoConfig?.contracts?.timeLock}
                    size={15}
                    strokeWidth={2}
                  />
                  <ViewOnExplorer
                    explorerUrl={`${daoConfig?.chain?.explorers?.[0]}/address/${daoConfig?.contracts?.timeLock}`}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
