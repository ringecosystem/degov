"use client";
import { useEffect, useMemo } from "react";
import { useAccount } from "wagmi";

import { tokenManager } from "@/lib/auth/token-manager";

/**
 * return 'loading' | 'unauthenticated' | 'authenticated'
 */
export const useAuthStatus = () => {
  const { address } = useAccount();
  const token = tokenManager.getToken(address);

  const status = useMemo(() => {
    if (token === undefined) {
      return "loading" as const;
    }

    if (token) {
      return "authenticated" as const;
    }

    return "unauthenticated" as const;
  }, [token]);

  useEffect(() => {
    return () => {
      tokenManager.clearAllTokens(address);
    };
  }, [address]);

  return status;
};
