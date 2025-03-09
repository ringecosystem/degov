import React, { useCallback, useMemo } from "react";

import { Empty } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
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
  maxHeight?: string;
  onRow?: (
    record: T,
    index: number
  ) => React.HTMLAttributes<HTMLTableRowElement>;
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
  maxHeight = "calc(100vh-200px)",
  onRow,
}: CustomTableProps<T>) {
  const getRowKey = useCallback(
    (record: T): string => {
      if (typeof rowKey === "function") {
        return rowKey(record);
      }
      return String(record[rowKey]);
    },
    [rowKey]
  );

  const renderCell = (record: T, column: ColumnType<T>, index: number) => {
    if (column.render) {
      return column.render(record, index);
    }

    const value = record[column.key as keyof T];
    return value !== null && value !== undefined ? String(value) : "";
  };

  const LoadingRows = useMemo(() => {
    return Array.from({ length: loadingRows }).map((_, index) => (
      <TableRow key={`loading-${index}`}>
        {columns.map((column) => (
          <TableCell
            key={`loading-cell-${column.key}-${index}`}
            className={column.className}
            style={{ width: column.width }}
          >
            <Skeleton
              className=" w-full"
              style={{
                height: loadingHeight,
              }}
            />
          </TableCell>
        ))}
      </TableRow>
    ));
  }, [columns, loadingRows, loadingHeight]);

  return (
    <div>
      <Table className="table-fixed">
        <TableHeader>
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
      </Table>

      <div
        className={cn("overflow-y-auto custom-scrollbar", bodyClassName)}
        style={{ maxHeight }}
      >
        <Table className="table-fixed">
          {caption && !isLoading && !!dataSource?.length && (
            <TableCaption className="pb-0">{caption}</TableCaption>
          )}
          <TableBody>
            {isLoading
              ? LoadingRows
              : dataSource.length > 0
              ? dataSource.map((record, index) => {
                  const rowProps = onRow ? onRow(record, index) : {};
                  return (
                    <TableRow key={getRowKey(record)} {...rowProps}>
                      {columns.map((column) => (
                        <TableCell
                          key={`${getRowKey(record)}-${column.key}`}
                          className={column.className}
                          style={{
                            width: column.width,
                            ...(column?.style || {}),
                          }}
                        >
                          {renderCell(record, column, index)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              : null}
          </TableBody>
        </Table>
      </div>

      {!isLoading && dataSource.length === 0 && (
        <Empty label={emptyText} className="h-[300px]" />
      )}
    </div>
  );
}
