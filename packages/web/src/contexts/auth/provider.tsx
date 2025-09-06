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

    // 定期验证token (每30秒检查一次)
    const validateInterval = setInterval(async () => {
      const currentToken = tokenManager.getToken();
      if (currentToken) {
        const isValid = await tokenManager.validateToken();
        if (!isValid) {
          // Token已失效，tokenManager.validateToken()内部已经清理了
          console.log('Token validation failed, cleared automatically');
        }
      }
    }, 30000);

    return () => {
      unsubscribe();
      clearInterval(validateInterval);
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