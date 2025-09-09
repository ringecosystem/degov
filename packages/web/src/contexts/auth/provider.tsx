"use client";
import { useState, useEffect, type ReactNode } from "react";

import { tokenManager } from "@/lib/auth/token-manager";

import { AuthContext } from "./context";

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [token, setTokenState] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initialToken = tokenManager.getToken();
    setTokenState(initialToken);
    setIsInitialized(true);
  }, []);

  const setToken = (newToken: string | null) => {
    tokenManager.setToken(newToken);
    setTokenState(newToken);
  };

  const isAuthenticated = Boolean(token && tokenManager.hasValidFormat());

  if (!isInitialized) {
    return null;
  }

  return (
    <AuthContext.Provider value={{ token, setToken, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
};
