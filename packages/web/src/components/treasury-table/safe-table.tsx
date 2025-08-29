"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Empty } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useChainInfo } from "@/hooks/useChainInfo";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { processChainIconUrl } from "@/utils";

import { Button } from "../ui/button";

import { Asset } from "./safe-asset";
import { TableSkeleton } from "./table-skeleton";

interface SafeTableProps {
  caption?: string;
}

export function SafeTable({ caption }: SafeTableProps) {
  const daoConfig = useDaoConfig();
  const { chainInfo: flatChainInfo, isFetching } = useChainInfo();
  const [visibleItems, setVisibleItems] = useState(5);

  const data = useMemo(() => {
    if (!daoConfig?.safes) return [];

    return (daoConfig.safes || []).map((v) => {
      const explorer = flatChainInfo?.[v.chainId ?? ""]?.blockExplorer;
      const icon = flatChainInfo?.[v.chainId ?? ""]?.icon;

      return {
        name: v.name,
        address: v.link.split(":")[2],
        chainId: v.chainId,
        link: v.link,
        blockExplorer: explorer,
        addressExplorer: `${explorer}/address/${v.link.split(":")[2]}`,
        chainIcon: processChainIconUrl(icon),
        chainName: flatChainInfo?.[v.chainId ?? ""]?.name,
      };
    });
  }, [daoConfig?.safes, flatChainInfo]);

  const displayData = useMemo(() => {
    return data.slice(0, visibleItems);
  }, [data, visibleItems]);

  const handleViewMore = useCallback(() => {
    setVisibleItems((prev) => prev + 5);
  }, []);

  const hasMoreItems = data.length > visibleItems;

  useEffect(() => {
    return () => setVisibleItems(5);
  }, []);

  return (
    <div className="rounded-[14px] bg-card p-[20px] shadow-card">
      {isFetching ? (
        <TableSkeleton />
      ) : (
        <Table>
          {data.length >= 5 && hasMoreItems && (
            <TableCaption className="pb-0">
              <span
                className="text-foreground transition-colors hover:text-foreground/80 cursor-pointer"
                onClick={handleViewMore}
              >
                {caption || "View more"}
              </span>
            </TableCaption>
          )}
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/3 rounded-l-[14px] text-left">
                Name
              </TableHead>
              <TableHead className="w-1/3 text-center">Network</TableHead>
              <TableHead className="w-1/3 rounded-r-[14px] text-right">
                Action
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {displayData?.map((value, index) => (
              <TableRow key={value.link ?? index}>
                <TableCell className="text-left">
                  <Asset
                    link={value?.link ?? ""}
                    symbol={value?.name}
                    explorer={value?.addressExplorer ?? ""}
                  />
                </TableCell>
                <TableCell className="text-center flex justify-center">
                  <Button
                    size="sm"
                    className="flex items-center gap-[5px] px-[10px] py-[5px] rounded-[30px] bg-gray-1 text-foreground hover:bg-gray-1/80 "
                    asChild
                  >
                    <Link
                      href={value?.blockExplorer ?? ""}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {value?.chainIcon && (
                        <Image
                          src={value?.chainIcon}
                          alt="chain-icon"
                          className="flex-shrink-0"
                          width={20}
                          height={20}
                        />
                      )}
                      <span className="text-[14px]">{value?.chainName}</span>
                    </Link>
                  </Button>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    className="gap-[5px] rounded-[100px] border-border bg-card"
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <Link
                      href={value?.link ?? ""}
                      target="_blank"
                      rel="noreferrer"
                    >
                      view on Safe
                      <Image
                        src="/assets/image/safe.svg"
                        alt="external-link"
                        className="h-[20px] w-[20px]"
                        width={20}
                        height={20}
                      />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {!data?.length && (
        <Empty
          label="No assets found"
          style={{
            height: 24 * 6,
          }}
        />
      )}
    </div>
  );
}
