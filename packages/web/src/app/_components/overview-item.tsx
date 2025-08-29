import Image from "next/image";
import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import type { ReactNode } from "react";
interface OverviewItemProps {
  title: string;
  icon: string;
  link?: string;
  isLoading?: boolean;
  children: ReactNode;
}

export const OverviewItem = ({
  title,
  icon,
  link,
  children,
  isLoading,
}: OverviewItemProps) => {
  const Component = link ? Link : "div";
  return (
    <Component
      className={cn(
        "flex w-full items-center justify-between rounded-[14px] bg-card p-[10px] lg:p-[20px] shadow-card",
        "aspect-[335/69] lg:aspect-[342/105]",
        link && "cursor-pointer",
        link && "hover:bg-card/80 transition-colors"
      )}
      href={link ?? (null as unknown as string)}
    >
      <div className="flex flex-col gap-[6px] lg:gap-[10px]">
        <p className="!m-0 text-[12px] lg:text-[14px] text-foreground/80">
          {title}
        </p>
        <div className="!m-0 text-[18px] lg:text-[28px] font-bold text-foreground">
          {isLoading ? (
            <div className="h-[32px] lg:h-[42px] w-[40px] lg:w-[50px] flex flex-col justify-center">
              <Skeleton className="h-[24px] lg:h-[32px] w-[40px] lg:w-[50px]" />
            </div>
          ) : (
            children
          )}
        </div>
      </div>
      <Image
        src={icon}
        alt={title}
        className="size-[40px] lg:size-[60px]"
        width={60}
        height={60}
      />
    </Component>
  );
};
