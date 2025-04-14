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
    if (!daoConfig?.safe) return [];

    return Object.keys(daoConfig.safe).map((v) => {
      const explorer =
        flatChainInfo?.[daoConfig?.safe?.[v]?.chainId ?? ""]?.blockExplorer;
      return {
        name: v,
        address: daoConfig?.safe?.[v]?.link.split(":")[2],
        chainId: daoConfig?.safe?.[v]?.chainId,
        link: daoConfig?.safe?.[v]?.link,
        blockExplorer: explorer,
        addressExplorer: `${explorer}/address/${
          daoConfig?.safe?.[v]?.link.split(":")[2]
        }`,
        chainIcon: flatChainInfo?.[daoConfig?.safe?.[v]?.chainId ?? ""]?.icon,
        chainName: flatChainInfo?.[daoConfig?.safe?.[v]?.chainId ?? ""]?.name,
      };
    });
  }, [daoConfig?.safe, flatChainInfo]);

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
    <div className="rounded-[14px] bg-card p-[20px]">
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
                    className="flex items-center gap-[5px] px-[10px] py-[5px] rounded-[30px] bg-[#474747] text-foreground hover:bg-[#474747]/80 "
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
          label="No assets have been configured"
          style={{
            height: 24 * 6,
          }}
        />
      )}
    </div>
  );
}
