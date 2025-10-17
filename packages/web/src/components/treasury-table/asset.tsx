import { blo } from "blo";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { ExternalLinkIcon } from "@/components/icons";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import type { TreasuryAssetWithPortfolio } from "@/hooks/useTreasuryAssets";

type AssetSummary = Pick<
  TreasuryAssetWithPortfolio,
  "address" | "logo" | "name" | "symbol" | "native"
>;

interface AssetProps {
  asset: AssetSummary;
  explorer?: string;
}

export const Asset = ({ asset, explorer }: AssetProps) => {
  const daoConfig = useDaoConfig();
  const daoLogo = daoConfig?.logo ?? "";
  const defaultPlaceholder =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

  const fallbackSrc = useMemo(() => {
    if (asset.native) {
      if (daoLogo) return daoLogo;
      if (asset.address) {
        try {
          return blo(asset.address as `0x${string}`);
        } catch {
          return defaultPlaceholder;
        }
      }
      return defaultPlaceholder;
    }

    if (asset.address) {
      try {
        return blo(asset.address as `0x${string}`);
      } catch {
        return daoLogo || defaultPlaceholder;
      }
    }

    return daoLogo || defaultPlaceholder;
  }, [asset.address, asset.native, daoLogo]);

  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [asset.address, asset.logo, asset.native]);

  const imageSrc =
    asset.logo && !hasError
      ? asset.logo
      : fallbackSrc || daoLogo || defaultPlaceholder;

  const handleImageError = () => {
    if (!hasError) {
      setHasError(true);
    }
  };

  const content = (
    <>
      <Image
        src={imageSrc}
        alt={asset.symbol || asset.name || "Token"}
        className="h-[30px] w-[30px] rounded-full"
        width={30}
        height={30}
        onError={handleImageError}
      />
      <div className="flex flex-col min-w-0">
        <span className="text-[14px] font-medium text-foreground truncate">
          {asset.name || asset.symbol || "Unknown"}
        </span>
      </div>
    </>
  );

  if (asset.native || !explorer) {
    return (
      <span className="flex items-center gap-[10px] text-foreground">
        {content}
      </span>
    );
  }

  return (
    <a
      className="flex items-center gap-[10px] text-foreground transition-opacity hover:underline hover:opacity-80"
      href={`${explorer}/token/${asset.address}`}
      target="_blank"
      rel="noreferrer"
    >
      {content}
      <ExternalLinkIcon
        width={16}
        height={16}
        className="h-[16px] w-[16px] shrink-0 text-current"
      />
    </a>
  );
};
