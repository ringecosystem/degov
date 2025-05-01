"use client";
import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";

export const ProfileSkeleton = ({ isDelegate }: { isDelegate: boolean }) => {
  return (
    <div className="flex flex-col gap-[20px]">
      {isDelegate ? (
        <div className="flex items-center gap-1 text-[18px] font-extrabold">
          <Link
            href="/delegates"
            className="text-muted-foreground hover:text-foreground"
          >
            Delegates
          </Link>
          <span className="text-muted-foreground">/</span>
          <Skeleton className="h-[24px] w-[120px]" />
        </div>
      ) : null}

      <div className="flex flex-col gap-[20px]">
        {/* User component skeleton */}
        <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
          <div className="flex w-full items-center gap-[10px] justify-between">
            <div className="flex items-center gap-[10px]">
              <Skeleton className="size-[70px] rounded-full" />
              <div className="flex flex-col gap-[10px]">
                <div className="flex items-center gap-[5px]">
                  <Skeleton className="h-[26px] w-[150px]" />
                  <Skeleton className="h-[14px] w-[60px]" />
                  <Skeleton className="size-[16px]" />
                  <Skeleton className="size-[16px]" />
                </div>
                <div className="flex items-center gap-[10px]">
                  {Array(5)
                    .fill(0)
                    .map((_, i) => (
                      <Skeleton key={i} className="size-[24px] rounded-full" />
                    ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-[10px]">
              <Skeleton className="h-[34px] w-[100px] rounded-full" />
            </div>
          </div>
          <div className="w-full h-[1px] bg-border/20"></div>
          <div className="space-y-2">
            <Skeleton className="h-[18px] w-full" />
            <Skeleton className="h-[18px] w-5/6" />
          </div>

          {/* Overview skeleton */}
          <div className="grid grid-cols-4 gap-[20px] w-full">
            {Array(4)
              .fill(0)
              .map((_, i) => (
                <div
                  key={i}
                  className="p-[10px] flex flex-col gap-[10px] rounded-[14px] bg-background"
                >
                  <Skeleton className="h-[12px] w-[80px]" />
                  <Skeleton className="h-[24px] w-[100px]" />
                </div>
              ))}
          </div>
        </div>

        {/* Received Delegations skeleton */}
        <div className="rounded-[14px] bg-card p-[20px]">
          <Skeleton className="h-[30px] w-[200px] mb-4" />
          <Skeleton className="h-[200px] w-full" />
        </div>
      </div>
    </div>
  );
};
