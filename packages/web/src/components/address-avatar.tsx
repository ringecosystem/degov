"use client";

import { blo } from "blo";
import Image from "next/image";

import { useAiBotAddress } from "@/hooks/useAiBotAddress";
import { useProfileQuery } from "@/hooks/useProfileQuery";
import { cn } from "@/lib/utils";

import type { Address } from "viem";

interface AddressAvatarProps {
  address: Address;
  size?: number;
  className?: string;
  skipFetch?: boolean;
}

export const AddressAvatar = ({
  address,
  size = 40,
  className,
  skipFetch = false,
}: AddressAvatarProps) => {
  const { data: profileData } = useProfileQuery(address, { skip: skipFetch });
  const { isAiBot } = useAiBotAddress(address);

  const avatarUrl = isAiBot
    ? "/assets/image/aibot.svg"
    : profileData?.data?.avatar || blo(address as `0x${string}`);

  return (
    <Image
      src={avatarUrl}
      alt={`Avatar for ${address}`}
      width={size}
      height={size}
      className={cn("rounded-full shrink-0", className)}
      style={{
        width: size,
        height: size,
      }}
    />
  );
};
