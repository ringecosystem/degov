"use client";
import type { BlockSyncStatus } from "@/hooks/useBlockSync";
import { cn } from "@/lib/utils";

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
  return (
    <div className="flex flex-col gap-[10px] rounded-[10px] bg-card p-[10px] shadow-sm">
      <div className="h-[20px] w-full rounded-[100px] bg-secondary">
        <div
          className={cn(
            "flex h-full items-center justify-start rounded-[100px] px-[5px]",
            INDEXER_CONFIG.colors[status]
          )}
          style={{ width: `${syncPercentage}%` }}
        >
          <span className="text-xs text-white inline-flex gap-1">
            <span>{syncPercentage.toFixed(1)}%</span>
            <span className="text-xs capitalize text-white">{status}</span>
          </span>
        </div>
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help">
              #{indexedBlock.toLocaleString()}
            </span>
          </TooltipTrigger>
          <TooltipContent className="w-[200px]">
            <span>
              The indexed block number indicates the last block number that has
              been indexed by the indexer.{" "}
            </span>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help">
              #{currentBlock.toLocaleString()}
            </span>
          </TooltipTrigger>
          <TooltipContent className="w-[200px]">
            <span>
              The latest block number indicates the latest block number on the
              chain.
            </span>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
