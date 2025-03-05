import Image from "next/image";

import type { TokenDetails } from "@/types/config";

interface AssetProps {
  asset: TokenDetails;
  explorer: string;
  symbol: string;
}
export const Asset = ({ asset, explorer, symbol }: AssetProps) => {
  return (
    <a
      className="flex items-center gap-[10px] text-[14px] text-foreground transition-opacity hover:underline hover:opacity-80"
      href={`${explorer}/token/${asset.contract}`}
      target="_blank"
      rel="noreferrer"
    >
      <Image
        src={asset.logo}
        alt={symbol || "N/A"}
        className="h-[30px] w-[30px] rounded-full"
        width={30}
        height={30}
      />
      <span className="text-[14px] capitalize text-foreground">
        {symbol || "N/A"}
      </span>
      <Image
        src="/assets/image/external-link.svg"
        alt="external-link"
        className="h-[16px] w-[16px]"
        width={16}
        height={16}
      />
    </a>
  );
};
