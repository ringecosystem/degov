"use client";

import { blo } from "blo";
import Image from "next/image";
import { useState, useEffect } from "react";

import { cn } from "@/lib/utils";

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
  const [indexedAvatarUrl, setIndexedAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchAvatar = async () => {
      try {
        const indexedAvatar = await fetchAvatarFromIndex(address);
        if (indexedAvatar && mounted) {
          setIndexedAvatarUrl(indexedAvatar);
        }
      } catch (error) {
        console.error("Error fetching avatar:", error);
      }
    };

    fetchAvatar();

    return () => {
      mounted = false;
    };
  }, [address]);

  const avatarUrl = indexedAvatarUrl || blo(address as `0x${string}`);

  return (
    <Image
      src={avatarUrl}
      alt={`Avatar for ${address}`}
      width={size}
      height={size}
      className={cn("rounded-full", className)}
    />
  );
};

// fake
const fetchAvatarFromIndex = async (
  address: Address
): Promise<string | null> => {
  console.warn("fetchAvatarFromIndex", address);
  return null;
};
