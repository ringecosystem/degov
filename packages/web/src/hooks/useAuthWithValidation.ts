'use client';
import { useCallback, useState, useEffect } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { toast } from 'react-toastify';

import { useAuth } from '@/contexts/auth';
import { tokenManager } from '@/lib/auth/token-manager';
import { useSiweAuth } from '@/hooks/useSiweAuth';

export const useAuthWithValidation = () => {
  const { isAuthenticated, token } = useAuth();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { authenticate, isAuthenticating } = useSiweAuth();
  const [isValidating, setIsValidating] = useState(false);

  // 确保用户连接并认证
  const ensureAuth = useCallback(async (): Promise<boolean> => {
    // 1. 检查钱包连接状态
    if (!isConnected) {
      openConnectModal?.();
      return false;
    }

    // 2. 检查认证状态
    if (!isAuthenticated) {
      try {
        const authSuccess = await authenticate();
        return authSuccess;
      } catch (error) {
        console.error('Authentication failed:', error);
        return false;
      }
    }

    // 3. 验证token是否仍然有效
    setIsValidating(true);
    const isValid = await tokenManager.validateToken();
    setIsValidating(false);

    if (!isValid) {
      // Token失效，尝试重新认证
      try {
        const authSuccess = await authenticate();
        return authSuccess;
      } catch (error) {
        console.error('Re-authentication failed:', error);
        toast.error('Authentication expired, please sign in again');
        return false;
      }
    }

    return true;
  }, [isConnected, isAuthenticated, openConnectModal, authenticate]);

  // 需要认证的操作包装器
  const withAuth = useCallback(
    <T extends any[], R>(action: (...args: T) => Promise<R> | R) => {
      return async (...args: T): Promise<R | null> => {
        const isAuthed = await ensureAuth();
        if (!isAuthed) {
          return null;
        }

        try {
          return await action(...args);
        } catch (error) {
          // 如果是认证相关错误，尝试重新认证
          if (error instanceof Error && 
              (error.message.includes('401') || 
               error.message.includes('Authentication') || 
               error.message.includes('Token expired'))) {
            const reAuthSuccess = await ensureAuth();
            if (reAuthSuccess) {
              // 重新认证成功，重试操作
              return await action(...args);
            }
          }
          throw error;
        }
      };
    },
    [ensureAuth]
  );

  // 强制验证token
  const forceValidation = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    
    setIsValidating(true);
    const isValid = await tokenManager.validateToken();
    setIsValidating(false);
    
    return isValid;
  }, [token]);

  // 手动清除认证状态
  const signOut = useCallback(() => {
    tokenManager.clearToken();
    toast.success('Successfully signed out');
  }, []);

  return {
    // 状态
    isAuthenticated: isConnected && isAuthenticated,
    token,
    isValidating,
    isAuthenticating,
    canAuthenticate: isConnected,

    // 方法
    ensureAuth,
    withAuth,
    forceValidation,
    signOut,
  };
};