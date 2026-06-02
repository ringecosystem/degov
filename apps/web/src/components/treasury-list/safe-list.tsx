"use client";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useChainInfo } from "@/hooks/useChainInfo";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { processChainIconUrl } from "@/utils";

import { Asset } from "../treasury-table/safe-asset";
import { Skeleton } from "../ui/skeleton";

interface SafeListProps {
  caption?: string;
}

const Caption = ({
  caption,
  handleViewMore,
}: {
  caption?: string;
  handleViewMore: () => void;
}) => {
  const t = useTranslations("treasury");
  return (
    <div className="flex justify-center items-center w-full border border-border/20 bg-card rounded-[14px] px-4 py-2">
      <button
        onClick={handleViewMore}
        className="text-foreground transition-colors hover:text-foreground/80"
      >
        {caption || t("viewMore")}
      </button>
    </div>
  );
};

export function SafeList({ caption }: SafeListProps) {
  const t = useTranslations("treasury.safe");
  const tCommon = useTranslations("treasury");
  const tEmpty = useTranslations("treasury.empty");
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
  }, [daoConfig, flatChainInfo]);

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

  if (isFetching) {
    return (
      <div className="space-y-4">
        <h4 className="text-[16px] font-semibold text-foreground">
          {t("safes")}
        </h4>
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[14px] bg-card p-4 border border-border/20"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-20 rounded-full" />
                <Skeleton className="h-8 w-24 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="space-y-4">
        <h4 className="text-[16px] font-semibold text-foreground">
          {t("safe")}
        </h4>
        <div className="rounded-[14px] bg-card p-[20px] text-center text-foreground/60">
          {tEmpty("noAssetsFound")}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h4 className="text-[16px] font-semibold text-foreground">
        {t("safes")}
      </h4>

      {displayData?.map((value, index) => (
        <div
          key={value.link ?? index}
          className="rounded-[14px] bg-card p-[10px] shadow-card"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Asset
                link={value?.link ?? ""}
                symbol={value?.name}
                explorer={value?.addressExplorer ?? ""}
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="gap-[5px] rounded-[100px] bg-card ">
                <Link
                  href={value?.link ?? ""}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-[5px]"
                >
                  <span className="text-[12px]">{t("viewOnSafe")}</span>
                  <Image
                    src="/assets/image/safe.svg"
                    alt={tCommon("accessibility.externalLink")}
                    className="h-[16px] w-[16px]"
                    width={20}
                    height={20}
                  />
                </Link>
              </div>
            </div>
          </div>
        </div>
      ))}

      {data.length >= 5 && hasMoreItems && (
        <Caption caption={caption} handleViewMore={handleViewMore} />
      )}
    </div>
  );
}
