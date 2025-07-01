import Link from "next/link";

import { AddressAvatar } from "@/components/address-avatar";
import { AddressResolver } from "@/components/address-resolver";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAiBotAddress } from "@/hooks/useAiBotAddress";
import { cn } from "@/lib/utils";

import { AiIcon } from "./icons/ai-icon";

interface AddressWithAvatarProps {
  address: `0x${string}`;
  avatarSize?: number;
  className?: string;
  textClassName?: string;
  customLink?: (address: `0x${string}`) => string;
}

export function AddressWithAvatar({
  address,
  avatarSize = 30,
  className,
  textClassName,
  customLink,
}: AddressWithAvatarProps) {
  const { isAiBot } = useAiBotAddress(address);
  return (
    <Link
      href={customLink ? customLink(address) : `/delegate/${address}`}
      target={!!customLink ? "_blank" : undefined}
      rel={!!customLink ? "noopener noreferrer" : undefined}
      className={cn("inline-flex items-center gap-[10px]", className)}
    >
      <AddressAvatar address={address} size={avatarSize} />
      <Tooltip>
        <TooltipTrigger>
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
        </TooltipTrigger>
        <TooltipContent>
          <p>{address}</p>
        </TooltipContent>
      </Tooltip>
      {isAiBot && (
        <Tooltip>
          <TooltipTrigger>
            <AiIcon />
          </TooltipTrigger>
          <TooltipContent className="max-w-[200px]">
            An AI-Powered delegate that can accept delegations and vote on your
            behalf based on the community&apos;s preferences.
          </TooltipContent>
        </Tooltip>
      )}
    </Link>
  );
}
