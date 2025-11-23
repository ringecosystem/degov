"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAccount } from "wagmi";

import { tokenManager } from "@/lib/auth/token-manager";

import { useMounted } from "./useMounted";

/**
 * return 'loading' | 'unauthenticated' | 'authenticated'
 */
export const useAuthStatus = () => {
  const { address } = useAccount();
  const token = tokenManager.getToken(address);
  const mounted = useMounted();
  const prevAddressRef = useRef<string | undefined>(undefined);

  const status = useMemo(() => {
    if (!mounted) return "loading" as const;
    return token ? ("authenticated" as const) : ("unauthenticated" as const);
  }, [mounted, token]);

  // Clear tokens only when the connected address actually changes
  useEffect(() => {
    const prev = prevAddressRef.current;
    if (prev && prev !== address) {
      tokenManager.clearAllTokens(prev);
    }
    prevAddressRef.current = address;
  }, [address]);

  return status;
};
