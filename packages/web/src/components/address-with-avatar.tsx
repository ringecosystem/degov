import Link from "next/link";

import { AddressAvatar } from "@/components/address-avatar";
import { AddressResolver } from "@/components/address-resolver";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface AddressWithAvatarProps {
  address: `0x${string}`;
  avatarSize?: number;
  className?: string;
  textClassName?: string;
}

export function AddressWithAvatar({
  address,
  avatarSize = 30,
  className,
  textClassName,
}: AddressWithAvatarProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={`/profile/${address}`}
          className={cn("inline-flex items-center gap-[10px]", className)}
        >
          <AddressAvatar address={address} size={avatarSize} />
          <AddressResolver address={address} showShortAddress>
            {(ensName) => (
              <span
                className={cn(
                  "line-clamp-1 font-mono hover:underline",
                  textClassName
                )}
                title={address}
              >
                {ensName}
              </span>
            )}
          </AddressResolver>
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        <p>{address}</p>
      </TooltipContent>
    </Tooltip>
  );
}
