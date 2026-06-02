import { useMemo } from "react";

const DOTS = "dots" as const;

export type PaginationRangeItem = number | typeof DOTS;

export const PAGINATION_DOTS = DOTS;

export function usePaginationRange(
  currentPage: number,
  totalPageCount: number,
  siblingCount = 1
) : PaginationRangeItem[] {
  return useMemo<PaginationRangeItem[]>(() => {
    const totalPageNumbers = siblingCount * 2 + 5;

    if (totalPageNumbers >= totalPageCount) {
      return Array.from({ length: totalPageCount }, (_, index) => index + 1);
    }

    const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
    const rightSiblingIndex = Math.min(
      currentPage + siblingCount,
      totalPageCount
    );

    const shouldShowLeftDots = leftSiblingIndex > 2;
    const shouldShowRightDots = rightSiblingIndex < totalPageCount - 1;

    const firstPageIndex = 1;
    const lastPageIndex = totalPageCount;

    if (!shouldShowLeftDots && shouldShowRightDots) {
      const leftItemCount = 3 + 2 * siblingCount;
      const leftRange = Array.from({ length: leftItemCount }, (_, index) =>
        index + 1
      );

      return [...leftRange, DOTS, lastPageIndex];
    }

    if (shouldShowLeftDots && !shouldShowRightDots) {
      const rightItemCount = 3 + 2 * siblingCount;
      const rightRange = Array.from({ length: rightItemCount }, (_, index) =>
        lastPageIndex - rightItemCount + 1 + index
      );

      return [firstPageIndex, DOTS, ...rightRange];
    }

    return [
      firstPageIndex,
      DOTS,
      ...Array.from(
        { length: rightSiblingIndex - leftSiblingIndex + 1 },
        (_, index) => leftSiblingIndex + index
      ),
      DOTS,
      lastPageIndex,
    ];
  }, [currentPage, siblingCount, totalPageCount]);
}
