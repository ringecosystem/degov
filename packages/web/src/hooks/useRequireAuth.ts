'use client';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useCallback } from 'react';
import { useAccount } from 'wagmi';

import { useAuth } from '@/contexts/auth';
import { useSiweAuth } from '@/hooks/useSiweAuth';

export const useRequireAuth = () => {
  const { isAuthenticated } = useAuth();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { authenticate, isAuthenticating } = useSiweAuth();

  /**
   * 确保用户连接并认证，如果没有，引导用户完成认证
   * @returns Promise<boolean> - 认证是否成功
   */
  const ensureAuth = useCallback(async (): Promise<boolean> => {
    // 1. 检查钱包连接状态
    if (!isConnected) {
      openConnectModal?.();
      return false;
    }

    // 2. 检查认证状态
    if (!isAuthenticated) {
      const authSuccess = await authenticate();
      return authSuccess;
    }

    return true;
  }, [isConnected, isAuthenticated, openConnectModal, authenticate]);

  /**
   * 包装需要认证的操作
   * @param action - 需要认证的操作函数
   * @returns 包装后的函数，会先检查认证状态
   */
  const withAuth = useCallback(
    <T extends unknown[], R>(action: (...args: T) => Promise<R> | R) => {
      return async (...args: T): Promise<R | null> => {
        const isAuthed = await ensureAuth();
        if (!isAuthed) {
          return null;
        }
        return action(...args);
      };
    },
    [ensureAuth]
  );

  return {
    ensureAuth,
    withAuth,
    isAuthenticating,
    canAuthenticate: isConnected,
    isAuthenticated: isConnected && isAuthenticated,
  };
};