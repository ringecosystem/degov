"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { siweService } from "@/lib/auth/siwe-service";
import { tokenManager } from "@/lib/auth/token-manager";

/**
 * return 'loading' | 'unauthenticated' | 'authenticated'
 */
export const useAuthStatus = () => {
  const { address } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(false);
  const prevAddressRef = useRef<string | undefined>(undefined);

  const status = useMemo(() => {
    if (!mounted || isCheckingSession) return "loading" as const;
    return isAuthenticated
      ? ("authenticated" as const)
      : ("unauthenticated" as const);
  }, [mounted, isAuthenticated, isCheckingSession]);

  // Mark mounted after first client render
  useEffect(() => {
    setMounted(true);
  }, []);

  // Clear tokens only when the connected address actually changes
  useEffect(() => {
    const prev = prevAddressRef.current;
    if (prev && prev !== address) {
      tokenManager.clearAllTokens(prev);
      setIsAuthenticated(false);
    }
    prevAddressRef.current = address;
  }, [address]);

  useEffect(() => {
    if (!mounted) return;

    if (!address) {
      setIsAuthenticated(false);
      setIsCheckingSession(false);
      return;
    }

    let canceled = false;
    setIsCheckingSession(true);

    siweService
      .getAuthStatus(address)
      .then((result) => {
        if (canceled) return;
        setIsAuthenticated(result.authenticated);
      })
      .catch(() => {
        if (canceled) return;
        tokenManager.clearToken(address);
        setIsAuthenticated(false);
      })
      .finally(() => {
        if (canceled) return;
        setIsCheckingSession(false);
      });

    return () => {
      canceled = true;
    };
  }, [address, mounted]);

  return status;
};
