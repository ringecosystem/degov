"use client";

import AlertUI from "@/components/alert";
import { AlertIcon } from "@/components/icons";
import { useBlockSync } from "@/hooks/useBlockSync";
import { useIsDemoDao } from "@/hooks/useIsDemoDao";
export function Alert() {
  const isDemoDao = useIsDemoDao();
  const { status } = useBlockSync();
  if (isDemoDao) return null;
  return status !== "operational" ? (
    <AlertUI
      message={
        <span className="flex items-center gap-[10px] bg-danger p-[20px] rounded-[14px]">
          <AlertIcon width={24} height={24} className="flex-shrink-0" />
          <span className="text-[16px] text-always-light">
            Warning: The indexer service is currently below 95%. Data displayed
            on this site may be outdated. Please wait until the indexer fully
            syncs for the latest information.
          </span>
        </span>
      }
    />
  ) : null;
}
