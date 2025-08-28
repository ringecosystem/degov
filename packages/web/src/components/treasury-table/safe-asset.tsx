import { blo } from "blo";
import Image from "next/image";

import { ExternalLinkIcon } from "@/components/icons";

interface AssetProps {
  link: string;
  explorer: string;
  symbol: string;
}
export const Asset = ({ link, explorer, symbol }: AssetProps) => {
  return (
    <a
      className="flex items-center gap-[10px] text-[14px] text-foreground transition-opacity hover:underline hover:opacity-80"
      href={explorer}
      target="_blank"
      rel="noreferrer"
    >
      <Image
        src={blo(link as `0x${string}` || "")}
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
