"use client";

import { DropdownMenuContent } from "@/components/ui/dropdown-menu";

export const NotificationSkeleton = () => {
  return (
    <DropdownMenuContent
      className="rounded-[26px] border-grey-1 bg-dark p-[20px] shadow-card flex flex-col gap-[20px] w-[calc(100vw-40px)] max-w-[300px] lg:w-[300px]"
      align="end"
    >
      <div className="flex flex-col gap-[20px]">
        {/* Header skeleton - email with icon */}
        <div className="flex items-center gap-[5px]">
          <div className="w-6 h-6 bg-muted rounded animate-pulse" />
          <div className="h-[14px] bg-muted rounded w-32 animate-pulse" />
        </div>

        {/* Separator */}
        <div className="h-px w-full bg-grey-2/50"></div>

        {/* First toggle setting skeleton */}
        <div className="flex flex-col gap-[5px]">
          <div className="flex items-center gap-[10px]">
            <div className="h-[14px] bg-muted rounded w-24 animate-pulse flex-1" />
            <div className="w-11 h-6 bg-muted rounded-full animate-pulse" />
          </div>
          <div className="h-3 bg-muted rounded w-48 animate-pulse" />
        </div>

        {/* Second toggle setting skeleton */}
        <div className="flex flex-col gap-[5px]">
          <div className="flex items-center gap-[10px]">
            <div className="h-[14px] bg-muted rounded w-32 animate-pulse flex-1" />
            <div className="w-11 h-6 bg-muted rounded-full animate-pulse" />
          </div>
          <div className="h-3 bg-muted rounded w-40 animate-pulse" />
        </div>

        {/* Button skeleton */}
        <div className="w-full flex justify-end">
          <div className="h-7 bg-muted rounded-[100px] w-32 animate-pulse" />
        </div>
      </div>
    </DropdownMenuContent>
  );
};
