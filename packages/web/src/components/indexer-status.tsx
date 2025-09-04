"use client";
import Image from "next/image";
import { useMemo } from "react";

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

  const networkIcon = useMemo(() => {
    const icon = chainInfo?.[daoConfig?.chain?.id ?? ""]?.icon;
    return processChainIconUrl(icon);
  }, [chainInfo, daoConfig]);

  return (
    <div className="flex flex-col gap-[10px] rounded-[10px] bg-card p-[10px] shadow-sm">
      <div className="flex items-center gap-[5px] w-full">
        {!!networkIcon && (
          <Image
            src={networkIcon}
            alt="network icon"
            width={30}
            height={30}
            className="rounded-full size-[30px] lg:size-[20px]"
          />
        )}

        <div className="h-[30px] lg:h-[20px]  rounded-[100px] bg-secondary flex-1">
          <div
            className={cn(
              "flex h-full items-center justify-start rounded-[100px] px-[5px]",
              INDEXER_CONFIG.colors[status]
            )}
            style={{ width: `${syncPercentage}%` }}
          >
            <span className="text-xs text-always-light inline-flex gap-1">
              <span>{syncPercentage.toFixed(1)}%</span>
              <span className="text-xs capitalize text-always-light">{status}</span>
            </span>
          </div>
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
