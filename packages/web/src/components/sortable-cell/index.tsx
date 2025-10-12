'use client';

import { useCallback } from 'react';

import { cn } from '@/lib/utils';

import { ArrowDown } from './arrow-down';
import { ArrowUp } from './arrow-up';

export const SortableCell = ({
  className,
  textClassName,
  onClick,
  sortState,
  label = "Proposals",
}: {
  className?: string;
  textClassName?: string;
  onClick?: (sortState: "asc" | "desc" | undefined) => void;
  sortState?: "asc" | "desc" | undefined;
  label?: string;
}) => {
  const handleClick = useCallback(() => {
    let newSortState = sortState;
    if (!sortState) {
      newSortState = "desc";
    } else {
      newSortState = sortState === "desc" ? "asc" : undefined;
    }
    onClick?.(newSortState);
  }, [sortState, onClick]);

  return (
    <div
      className={cn(
        "flex w-full cursor-pointer items-center justify-center gap-[4px]",
        className
      )}
      onClick={handleClick}
    >
      <span className={cn("text-[12px]", textClassName)}>{label}</span>
      <span className="flex flex-col">
        <span
          style={{
            verticalAlign: "-0.125em",
          }}
        >
          <ArrowUp
            className={cn(
              sortState === "asc" && "opacity-100",
              sortState === "desc" && "opacity-50"
            )}
          />
        </span>

        <span
          className="-mt-[0.3em]"
          style={{
            verticalAlign: "-0.125em",
          }}
        >
          <ArrowDown
            className={cn(
              sortState === "asc" && "opacity-50",
              sortState === "desc" && "opacity-100"
            )}
          />
        </span>
      </span>
    </div>
  );
};
