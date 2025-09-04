import { blo } from "blo";
import Image from "next/image";

import { ExternalLinkIcon } from "@/components/icons";
import type { TokenDetails } from "@/types/config";

interface AssetProps {
  asset: TokenDetails;
  explorer: string;
  symbol: string;
  isNativeToken?: boolean;
}
export const Asset = ({
  asset,
  explorer,
  symbol,
  isNativeToken,
}: AssetProps) => {
  return isNativeToken ? (
    <span className="flex items-center gap-[10px] text-[14px] text-foreground transition-opacity hover:opacity-80">
      <Image
        src={asset.logo || blo(asset.contract as `0x${string}`) || ""}
        alt={symbol || "N/A"}
        className="h-[30px] w-[30px] rounded-full"
        width={30}
        height={30}
      />
      <span className="text-[14px] capitalize text-foreground">
        {symbol || "N/A"}
      </span>
    </span>
  ) : (
    <a
      className="flex items-center gap-[10px] text-[14px] text-foreground transition-opacity hover:underline hover:opacity-80"
      href={`${explorer}/token/${asset.contract}`}
      target="_blank"
      rel="noreferrer"
    >
      <Image
        src={asset.logo || blo(asset.contract as `0x${string}`) || ""}
        alt={symbol || "N/A"}
        className="h-[30px] w-[30px] rounded-full"
        width={30}
        height={30}
      />
      <span className="text-[14px] capitalize text-foreground">
        {symbol || "N/A"}
      </span>
      <ExternalLinkIcon
        width={16}
        height={16}
        className="h-[16px] w-[16px] text-current"
      />
    </a>
  );
};
