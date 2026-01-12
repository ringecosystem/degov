import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";

import { Empty } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface ColumnType<T> {
  title: React.ReactNode;
  key: string;
  width?: string | number;
  className?: string;
  style?: React.CSSProperties;
  render?: (value: T, index: number) => React.ReactNode;
}

export interface CustomTableProps<T> {
  columns: ColumnType<T>[];
  dataSource: T[];
  rowKey: keyof T | ((record: T) => string);
  caption?: React.ReactNode;
  isLoading?: boolean;
  loadingRows?: number;
  loadingHeight?: number;
  emptyText?: React.ReactNode;
  bodyClassName?: string;
  tableClassName?: string;
  maxHeight?: string;
  onRow?: (
    record: T,
    index: number
  ) => React.HTMLAttributes<HTMLTableRowElement>;
}

interface ScrollState {
  left: boolean;
  right: boolean;
}

const SHADOW_COLOR = "color-mix(in srgb, var(--foreground) 10%, transparent)";
const SHADOW_LEFT = `inset 16px 0 12px -10px ${SHADOW_COLOR}`;
const SHADOW_RIGHT = `inset -16px 0 12px -10px ${SHADOW_COLOR}`;

function computeScrollShadow(scroll: ScrollState): string {
  if (scroll.left && scroll.right) return `${SHADOW_LEFT}, ${SHADOW_RIGHT}`;
  if (scroll.left) return SHADOW_LEFT;
  if (scroll.right) return SHADOW_RIGHT;
  return "";
}

export function CustomTable<T extends Record<string, unknown>>({
  columns,
  dataSource,
  rowKey,
  caption,
  isLoading = false,
  loadingRows = 5,
  loadingHeight = 30,
  emptyText = "No data",
  bodyClassName,
  tableClassName,
  maxHeight,
  onRow,
}: CustomTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState<ScrollState>({
    left: false,
    right: false,
  });

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    const left = scrollLeft > 0;
    const right = scrollLeft + clientWidth < scrollWidth - 1;

    setScrollState((prev) => {
      if (prev.left === left && prev.right === right) return prev;
      return { left, right };
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    checkScroll();
    el.addEventListener("scroll", checkScroll);

    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", checkScroll);
      resizeObserver.disconnect();
    };
  }, [checkScroll, dataSource.length, isLoading, columns]);

  const getRowKey = useCallback(
    (record: T): string => {
      if (typeof rowKey === "function") {
        return rowKey(record);
      }
      return String(record[rowKey]);
    },
    [rowKey]
  );

  function renderCell(
    record: T,
    column: ColumnType<T>,
    index: number
  ): React.ReactNode {
    if (column.render) {
      return column.render(record, index);
    }
    const value = record[column.key as keyof T];
    return value != null ? String(value) : "";
  }

  const loadingRowsContent = useMemo(
    () =>
      Array.from({ length: loadingRows }).map((_, index) => (
        <TableRow key={`loading-${index}`}>
          {columns.map((column) => (
            <TableCell
              key={`loading-cell-${column.key}-${index}`}
              className={column.className}
              style={{ width: column.width }}
            >
              <Skeleton className="w-full" style={{ height: loadingHeight }} />
            </TableCell>
          ))}
        </TableRow>
      )),
    [columns, loadingRows, loadingHeight]
  );

  function renderTableBody(): React.ReactNode {
    if (isLoading) return loadingRowsContent;
    if (dataSource.length === 0) return null;

    return dataSource.map((record, index) => {
      const key = getRowKey(record);
      const rowProps = onRow?.(record, index) ?? {};

      return (
        <TableRow key={key} {...rowProps}>
          {columns.map((column) => (
            <TableCell
              key={`${key}-${column.key}`}
              className={column.className}
              style={{ width: column.width, ...column.style }}
            >
              {renderCell(record, column, index)}
            </TableCell>
          ))}
        </TableRow>
      );
    });
  }

  const hasData = dataSource.length > 0;
  const showEmpty = !isLoading && !hasData;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          className={cn("overflow-auto custom-scrollbar h-full", bodyClassName)}
          style={{ maxHeight, boxShadow: computeScrollShadow(scrollState) }}
        >
          <Table className={tableClassName}>
            <TableHeader className="sticky top-0 z-10 bg-card-background">
              <TableRow>
                {columns.map((column, index) => (
                  <TableHead
                    key={column.key}
                    className={cn(
                      index === 0 && "rounded-l-[14px]",
                      index === columns.length - 1 && "rounded-r-[14px]",
                      column.className
                    )}
                    style={{ width: column.width }}
                  >
                    {column.title}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>{renderTableBody()}</TableBody>
          </Table>
        </div>
      </div>

      {caption && hasData && (
        <div className="py-[20px] text-center text-[14px] text-foreground">
          {caption}
        </div>
      )}

      {showEmpty && (
        <Empty label={emptyText} style={{ height: loadingHeight * 4 }} />
      )}
    </div>
  );
}
