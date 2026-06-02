import { useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function TableSkeleton() {
  const t = useTranslations("treasury.headers");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/3 rounded-l-[14px] text-left">
            {t("name")}
          </TableHead>
          <TableHead className="w-1/3 text-center">{t("network")}</TableHead>
          <TableHead className="w-1/3 rounded-r-[14px] text-right">
            {t("action")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, index) => (
          <TableRow key={index}>
            <TableCell className="text-left">
              <div className="flex items-center gap-[10px]">
                <Skeleton className="h-6 w-[100px]" />
              </div>
            </TableCell>
            <TableCell className="text-center">
              <div className="flex items-center gap-[10px] justify-end">
                <Skeleton className="h-6 w-[80px]" />
              </div>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center gap-[10px] justify-end">
                <Skeleton className="h-6 w-[100px]" />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
