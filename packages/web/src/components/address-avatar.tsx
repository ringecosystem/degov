"use client";

import { useQuery } from "@tanstack/react-query";
import { blo } from "blo";
import Image from "next/image";

import { useAiBotAddress } from "@/hooks/useAiBotAddress";
import { cn } from "@/lib/utils";
import { profileService } from "@/services/graphql";

import type { Address } from "viem";

interface AddressAvatarProps {
  address: Address;
  size?: number;
  className?: string;
}

export const AddressAvatar = ({
  address,
  size = 40,
  className,
}: AddressAvatarProps) => {
  const { data: profileData } = useQuery({
    queryKey: ["profile", address],
    queryFn: () => profileService.getProfile(address),
    enabled: !!address,
  });

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
      className={cn("rounded-full flex-shrink-0", className)}
      style={{
        width: size,
        height: size,
      }}
    />
  );
};
