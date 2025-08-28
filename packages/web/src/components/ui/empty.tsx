import { EmptyIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

import type { ReactNode } from "react";
export function Empty({
  className,
  label,
  style,
}: {
  className?: string;
  label?: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-[10px]",
        className
      )}
      style={style}
    >
      <EmptyIcon
        width={60}
        height={60}
        className="size-[60px] text-current"
      />
      <div className="max-w-[320px] text-balance text-center text-[12px] font-normal text-foreground">
        {label || "No data"}
      </div>
    </div>
  );
}
