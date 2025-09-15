"use client";
import { useAccount } from "wagmi";

import { DEGOV_APPS_URL } from "@/config/base";
import { tokenManager } from "@/lib/auth/token-manager";

export const useDeGovAppsNavigation = () => {
  const { address } = useAccount();
  const remoteToken = tokenManager.getRemoteToken();

  if (!address || !remoteToken) {
    return undefined;
  }

  return `${DEGOV_APPS_URL}/notification/subscription?token=${encodeURIComponent(
    remoteToken
  )}&address=${encodeURIComponent(address)}`;
};
