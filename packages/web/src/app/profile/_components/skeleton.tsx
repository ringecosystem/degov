"use client";
import Link from "next/link";

import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export const ProfileSkeleton = ({ isDelegate }: { isDelegate: boolean }) => {
  return (
    <div className="flex flex-col gap-[30px] p-[30px]">
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

      <div className="grid grid-cols-[1fr_400px] gap-[20px]">
        {/* personal info skeleton */}
        <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
          <div className="flex items-center justify-between gap-[10px]">
            <div className="flex items-center gap-[20px]">
              <Skeleton className="size-[70px] rounded-full" />
              <div>
                <Skeleton className="mb-2 h-[30px] w-[150px]" />
                <Skeleton className="h-[20px] w-[120px]" />
              </div>
            </div>
            <div className="flex items-center gap-[20px]">
              <Skeleton className="h-[40px] w-[100px] rounded-full" />
            </div>
          </div>
          <Separator className="bg-border/40" />
          <div className="space-y-2">
            <Skeleton className="h-[16px] w-full" />
            <Skeleton className="h-[16px] w-5/6" />
            <Skeleton className="h-[16px] w-4/6" />
          </div>

          <div className="flex items-center gap-[20px]">
            {Array(5)
              .fill(0)
              .map((_, i) => (
                <Skeleton key={i} className="size-[24px] rounded-full" />
              ))}
          </div>
        </div>

        {/* Voting Power skeleton */}
        <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px] py-[40px]">
          <div className="flex flex-col justify-center gap-[10px]">
            <span className="text-[18px] font-semibold leading-none text-muted-foreground/80 flex items-center gap-[5px]">
              <Skeleton className="size-[24px]" />
              <Skeleton className="h-[18px] w-[150px]" />
            </span>
            <Skeleton className="h-[56px] w-[280px]" />
          </div>

          <div className="flex flex-col justify-center gap-[10px]">
            <Skeleton className="h-[14px] w-[140px]" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-[34px] w-[150px]" />
              <Skeleton className="h-[24px] w-[60px]" />
            </div>
          </div>
        </div>
      </div>

      {/* Received Delegations skeleton */}
      <div className="rounded-[14px] bg-card p-[20px]">
        <Skeleton className="h-[30px] w-[200px] mb-4" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    </div>
  );
};
