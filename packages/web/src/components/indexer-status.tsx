"use client";
import { useBlockSync } from "@/hooks/useBlockSync";
import { cn } from "@/lib/utils";

import { INDEXER_CONFIG } from "../config/indexer";
export function IndexerStatus() {
  const { status, syncPercentage, currentBlock, indexedBlock } = useBlockSync();

  return (
    <div className="flex flex-col gap-[10px] rounded-[10px] bg-card p-[10px] shadow-sm">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Indexed</span>
        <span>Latest</span>
      </div>

      <div className="h-[20px] w-full rounded-[100px] bg-secondary">
        <div
          className={cn(
            "flex h-full items-center justify-start rounded-[100px] px-[5px]",
            INDEXER_CONFIG.colors[status]
          )}
          style={{ width: `${syncPercentage}%` }}
        >
          <span className="text-xs text-white">
            {syncPercentage.toFixed(1)}%{" "}
            {<span className="text-xs capitalize text-white">{status}</span>}
          </span>
        </div>
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>#{indexedBlock.toLocaleString()}</span>
        <span>#{currentBlock.toLocaleString()}</span>
      </div>
    </div>
  );
}
