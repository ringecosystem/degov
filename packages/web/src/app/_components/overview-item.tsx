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
        "flex w-full items-center justify-between rounded-[14px] bg-card p-[20px]",
        link && "cursor-pointer",
        link && "hover:bg-card/80 transition-colors"
      )}
      style={{ aspectRatio: "342/105" }}
      href={link ?? (null as unknown as string)}
    >
      <div className="flex flex-col gap-[10px]">
        <p className="!m-0 text-[14px] text-foreground/80">{title}</p>
        <div className="!m-0 text-[28px] font-bold text-foreground">
          {isLoading ? (
            <div className="h-[42px] w-[50px] flex flex-col justify-center">
              <Skeleton className="h-[32px] w-[50px]" />
            </div>
          ) : (
            children
          )}
        </div>
      </div>
      <Image
        src={icon}
        alt={title}
        className="size-[60px]"
        width={60}
        height={60}
      />
    </Component>
  );
};
