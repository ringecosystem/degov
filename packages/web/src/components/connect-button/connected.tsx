import { ChevronDown, Power } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDisconnectWallet } from "@/hooks/useDisconnectWallet";
import { formatShortAddress } from "@/utils";


import { AddressAvatar } from "../address-avatar";
import { AddressResolver } from "../address-resolver";
import ClipboardIconButton from "../clipboard-icon-button";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
interface ConnectedProps {
  address: `0x${string}`;
}

export const Connected = ({ address }: ConnectedProps) => {
  const { disconnectWallet } = useDisconnectWallet();

  const handleDisconnect = useCallback(() => {
    disconnectWallet(address);
  }, [disconnectWallet, address]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <AddressResolver address={address} showShortAddress>
          {(value) => (
            <div className="flex items-center gap-[10px] rounded-[10px] border border-border px-4 py-2">
              <AddressAvatar
                address={address}
                className="size-[24px] rounded-full"
                size={24}
              />
              <span className="text-[14px]">{value}</span>
              <ChevronDown size={20} className="text-muted-foreground" />
            </div>
          )}
        </AddressResolver>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="rounded-[26px] border-border/20 bg-card p-[20px] shadow-2xl"
        align="end"
      >
        <div className="flex items-center gap-[10px]">
          <AddressAvatar address={address} className="rounded-full" />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[18px] font-extrabold text-white/80">
                {formatShortAddress(address)}
              </span>
            </TooltipTrigger>
            <TooltipContent>{address}</TooltipContent>
          </Tooltip>
          <ClipboardIconButton text={address} size={20} />
        </div>
        <DropdownMenuSeparator className="my-[20px] bg-border/20" />
        <div className="flex flex-col justify-center gap-[20px]">
          <Button
            asChild
            className="w-full gap-[10px] rounded-[100px] border-border bg-card"
            variant="outline"
          >
            <Link href="/profile">
              <Image
                src="/assets/image/profile.svg"
                alt="profile"
                width={20}
                height={20}
              />
              <span className="text-[14px]">Profile</span>
            </Link>
          </Button>
          <Button
            onClick={handleDisconnect}
            className="w-full gap-[10px] rounded-[100px] border-border bg-card"
            variant="outline"
          >
            <Power size={20} className="text-white" strokeWidth={2} />
            <span className="text-[14px]">Disconnect</span>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
