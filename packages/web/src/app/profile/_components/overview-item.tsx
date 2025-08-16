import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";

interface OverviewItemProps {
  title: string;
  value?: React.ReactNode;
  isLoading?: boolean;
  link?: string;
}
export const OverviewItem = ({
  title,
  value,
  isLoading,
  link,
}: OverviewItemProps) => {
  return link ? (
    <Link
      href={link}
      className="p-[10px] flex flex-row justify-between lg:flex-col gap-[8px] lg:gap-[10px] rounded-[14px] bg-card-background hover:opacity-80 transition-opacity"
    >
      <h5 className="text-[11px] lg:text-[12px] font-normal leading-normal text-foreground">
        {title}
      </h5>
      {isLoading ? (
        <Skeleton className="h-[20px] lg:h-[24px] w-[80px] lg:w-[100px]" />
      ) : (
        <p className="text-[16px] lg:text-[18px] font-semibold leading-[100%] text-foreground break-words">
          {value || ""}
        </p>
      )}
    </Link>
  ) : (
    <div className="p-[10px] flex flex-row justify-between lg:flex-col gap-[8px] lg:gap-[10px] rounded-[14px] bg-card-background">
      <h5 className="text-[11px] lg:text-[12px] font-normal leading-normal text-foreground">
        {title}
      </h5>
      {isLoading ? (
        <Skeleton className="h-[20px] lg:h-[24px] w-[80px] lg:w-[100px]" />
      ) : (
        <p className="text-[16px] lg:text-[18px] font-semibold leading-[100%] text-foreground break-words">
          {value || ""}
        </p>
      )}
    </div>
  );
};
