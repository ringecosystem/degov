"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";

import { useAuth } from "@/contexts/auth";
import { useSiweAuth } from "@/hooks/useSiweAuth";
import { registerAuthenticator } from "@/lib/auth/auth-client";

export function AuthBridge() {
  const { isConnected } = useAccount();
  const { isAuthenticated } = useAuth();
  const { authenticate } = useSiweAuth();

  // Register authenticator for non-React callers (e.g., fetchWithAuth)
  useEffect(() => {
    registerAuthenticator(authenticate);
  }, [authenticate]);

  // Auto-auth on first wallet connect when no valid token exists
  const attemptedRef = useRef(false);
  useEffect(() => {
    if (isConnected && !isAuthenticated && !attemptedRef.current) {
      attemptedRef.current = true;
      authenticate().finally(() => {
        // allow retry after a short delay to prevent rapid loops
        setTimeout(() => {
          attemptedRef.current = false;
        }, 3000);
      });
    }
  }, [isConnected, isAuthenticated, authenticate]);

  return null;
}

