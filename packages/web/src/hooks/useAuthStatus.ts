"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { tokenManager } from "@/lib/auth/token-manager";

/**
 * return 'loading' | 'unauthenticated' | 'authenticated'
 */
export const useAuthStatus = () => {
  const { address } = useAccount();
  const isAuthenticated = tokenManager.isAuthenticated(address);
  const [mounted, setMounted] = useState(false);
  const prevAddressRef = useRef<string | undefined>(undefined);

  const status = useMemo(() => {
    if (!mounted) return "loading" as const;
    return isAuthenticated
      ? ("authenticated" as const)
      : ("unauthenticated" as const);
  }, [mounted, isAuthenticated]);

  // Mark mounted after first client render
  useEffect(() => {
    setMounted(true);
  }, []);

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
