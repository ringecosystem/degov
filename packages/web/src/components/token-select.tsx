import Image from "next/image";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { Address } from "viem";

export type TokenInfo = {
  address: Address;
  symbol: string;
  decimals: number;
  icon: string;
};

export function TokenSelect({ tokenList }: { tokenList: TokenInfo[] }) {
  return (
    <Select value={tokenList?.[0]?.address}>
      <SelectTrigger className="w-[180px] rounded-[10px] border border-border bg-card p-[10px]">
        <SelectValue placeholder="Select a token" />
      </SelectTrigger>
      <SelectContent className="bg-card">
        <SelectGroup>
          {tokenList.map((token) => (
            <SelectItem key={token.address} value={token.address}>
              <div className="flex items-center gap-[10px]">
                {token?.icon ? (
                  <Image
                    src={token.icon}
                    alt={token.symbol}
                    width={24}
                    height={24}
                  />
                ) : null}

                <span className="truncate">{token.symbol}</span>
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
