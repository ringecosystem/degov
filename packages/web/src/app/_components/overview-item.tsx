import Image from "next/image";

import { Skeleton } from "@/components/ui/skeleton";

import type { ReactNode } from "react";
interface OverviewItemProps {
  title: string;
  icon: string;
  isLoading?: boolean;
  children: ReactNode;
}

export const OverviewItem = ({
  title,
  icon,
  children,
  isLoading,
}: OverviewItemProps) => {
  return (
    <div
      className="flex w-full items-center justify-between rounded-[14px] bg-card p-[20px]"
      style={{ aspectRatio: "342/105" }}
    >
      <div className="flex flex-col gap-[10px]">
        <p className="!m-0 text-[14px] text-card-foreground">{title}</p>
        <div className="!m-0 text-[28px] font-bold text-white">
          {isLoading ? <Skeleton className="h-[28px] w-[50px]" /> : children}
        </div>
      </div>
      <Image
        src={icon}
        alt={title}
        className="size-[60px]"
        width={60}
        height={60}
      />
    </div>
  );
};
