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
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  skipFetch?: boolean;
}

const defaultDelayDuration = 200;

export function AddressWithAvatar({
  address,
  avatarSize = 30,
  side = "bottom",
  align = "start",
  className,
  textClassName,
  customLink,
  skipFetch = false,
}: AddressWithAvatarProps) {
  const { isAiBot } = useAiBotAddress(address);
  return (
    <Link
      href={customLink ? customLink(address) : `/delegate/${address}`}
      target={!!customLink ? "_blank" : undefined}
      rel={!!customLink ? "noopener noreferrer" : undefined}
      className={cn("inline-flex items-center gap-[10px]", className)}
    >
      <AddressAvatar
        address={address}
        size={avatarSize}
        skipFetch={skipFetch}
      />
      <Tooltip delayDuration={defaultDelayDuration}>
        <AddressResolver
          address={address}
          showShortAddress
          skipFetch={skipFetch}
        >
          {(ensName) => (
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "line-clamp-1 font-mono hover:underline",
                  textClassName
                )}
                title={address}
              >
                {ensName}
              </span>
            </TooltipTrigger>
          )}
        </AddressResolver>
        <TooltipContent side={side} align={align}>
          <p>{address}</p>
        </TooltipContent>
      </Tooltip>
      {isAiBot && (
        <Tooltip delayDuration={defaultDelayDuration}>
          <TooltipTrigger asChild>
            <span>
              <AiIcon />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-[200px]" side={side} align={align}>
            An AI-Powered delegate that can accept delegations and vote on your
            behalf based on the community&apos;s preferences.
          </TooltipContent>
        </Tooltip>
      )}
    </Link>
  );
}
