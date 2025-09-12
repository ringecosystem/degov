"use client";
import { useMemo } from "react";

import { useAuth } from "@/contexts/auth";

/**
 * return 'loading' | 'unauthenticated' | 'authenticated'
 */
export const useAuthStatus = () => {
  const { token, isAuthenticated } = useAuth();

  const status = useMemo(() => {
    if (token === undefined) {
      return "loading" as const;
    }

    if (isAuthenticated) {
      return "authenticated" as const;
    }

    return "unauthenticated" as const;
  }, [token, isAuthenticated]);

  return status;
};
