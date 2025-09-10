"use client";
import { useAccount } from "wagmi";

import { tokenManager } from "@/lib/auth/token-manager";

export const useDeGovAppsNavigation = () => {
  const { address } = useAccount();
  const remoteToken = tokenManager.getRemoteToken();
  
  if (!address || !remoteToken) {
    return undefined;
  }

  return `https://apps.degov.ai/notification/subscription?token=${remoteToken}&address=${address}`;
};