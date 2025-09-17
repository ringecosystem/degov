"use client";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";

import { tokenManager } from "@/lib/auth/token-manager";

/**
 * return 'loading' | 'unauthenticated' | 'authenticated'
 */
export const useAuthStatus = () => {
  const { address } = useAccount();
  const token = tokenManager.getToken(address);
  const [mounted, setMounted] = useState(false);

  const status = useMemo(() => {
    if (!mounted) return "loading" as const;
    return token ? ("authenticated" as const) : ("unauthenticated" as const);
  }, [mounted, token]);

  useEffect(() => {
    setMounted(true);
    return () => {
      tokenManager.clearAllTokens(address);
    };
  }, [address]);

  return status;
};
