import Link from "next/link";

import { AddressAvatar } from "@/components/address-avatar";
import { AddressResolver } from "@/components/address-resolver";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatShortAddress } from "@/utils/address";

interface AddressWithAvatarFullProps {
  address: `0x${string}`;
  avatarSize?: number;
  link?: string;
  className?: string;
  textClassName?: string;
  skipFetch?: boolean;
}

export function AddressWithAvatarFull({
  address,
  avatarSize = 34,
  link,
  className,
  textClassName,
  skipFetch = false,
}: AddressWithAvatarFullProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-[10px]">
          <Link
            href={link ?? `/profile/${address}`}
            className={cn(
              "inline-flex items-center gap-[10px] hover:underline",
              className
            )}
          >
            <AddressAvatar
              address={address}
              size={avatarSize}
              skipFetch={skipFetch}
            />
            <AddressResolver
              address={address}
              showShortAddress
              skipFetch={skipFetch}
            >
              {(ensName) => (
                <span
                  className={cn(
                    "line-clamp-1 text-[16px] font-semibold",
                    textClassName
                  )}
                  title={address}
                >
                  {ensName}
                </span>
              )}
            </AddressResolver>
          </Link>
          <span className="text-[14px] font-normal">
            ({formatShortAddress(address)})
          </span>
        </div>
      </TooltipTrigger>

      <TooltipContent>
        <p>{address}</p>
      </TooltipContent>
    </Tooltip>
  );
}
