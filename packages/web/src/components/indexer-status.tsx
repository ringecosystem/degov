"use client";
import Image from "next/image";
import Link from "next/link";

import { BottomLogoIcon } from "@/components/icons";
import type { BlockSyncStatus } from "@/hooks/useBlockSync";
import { useChainInfo } from "@/hooks/useChainInfo";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { cn } from "@/lib/utils";
import { processChainIconUrl } from "@/utils";

import { INDEXER_CONFIG } from "../config/indexer";

import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface IndexerStatusProps {
  currentBlock: number;
  indexedBlock: number;
  syncPercentage: number;
  status: BlockSyncStatus;
}
export function IndexerStatus({
  currentBlock,
  indexedBlock,
  syncPercentage,
  status,
}: IndexerStatusProps) {
  const { chainInfo } = useChainInfo();
  const daoConfig = useDaoConfig();

  const networkIcon = processChainIconUrl(
    chainInfo?.[daoConfig?.chain?.id ?? ""]?.icon
  );

  const clampedPercentage = Math.max(0, Math.min(syncPercentage, 100));
  const formattedPercentage = clampedPercentage.toFixed(1);
  const hoverMessage = `Currently at block ${indexedBlock.toLocaleString()} of ${currentBlock.toLocaleString()}`;

  return (
    <div className="flex flex-col gap-[16px]">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex w-full cursor-help items-center gap-3">
            {!!networkIcon && (
              <Image
                src={networkIcon}
                alt="network icon"
                width={32}
                height={32}
                className="size-[32px] rounded-full lg:size-[24px]"
              />
            )}

            <div
              className={cn(
                "relative h-[30px] flex-1 overflow-hidden rounded-full lg:h-[20px] bg-grey-1"
              )}
            >
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out",
                  INDEXER_CONFIG.colors[status]
                )}
                style={{ width: `${clampedPercentage}%` }}
              />
              <span
                className={cn(
                  "absolute inset-0 z-10 flex items-center justify-center gap-[5px] whitespace-nowrap px-4 text-[12px] text-always-light"
                )}
              >
                <span>{formattedPercentage}%</span>
                <span>{INDEXER_CONFIG.labels[status]}</span>
              </span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          sideOffset={12}
          className="bg-card border border-card-background shadow-xs max-w-[350px] rounded-[26px] p-[20px] text-[14px]"
        >
          {hoverMessage}
        </TooltipContent>
      </Tooltip>

      <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
        <span>Powered By</span>
        <Link
          href="https://degov.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-opacity hover:opacity-80"
        >
          <BottomLogoIcon width={14} height={14} />
        </Link>
        <span>DeGov.AI</span>
      </div>
    </div>
  );
}
