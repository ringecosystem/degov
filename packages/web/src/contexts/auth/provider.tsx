'use client';
import { useState, useEffect, type ReactNode } from 'react';

import { tokenManager } from '@/lib/auth/token-manager';

import { AuthContext } from './context';

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [token, setTokenState] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // 初始化token
    const initialToken = tokenManager.getToken();
    setTokenState(initialToken);
    setIsInitialized(true);

    // 订阅token变化
    const unsubscribe = tokenManager.subscribe((newToken) => {
      setTokenState(newToken);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const setToken = (newToken: string | null) => {
    tokenManager.setToken(newToken);
  };

  const isAuthenticated = Boolean(token && tokenManager.hasValidFormat());

  // token 初始化完成前不渲染子组件
  if (!isInitialized) {
    return null;
  }

  return (
    <AuthContext.Provider value={{ token, setToken, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
};
