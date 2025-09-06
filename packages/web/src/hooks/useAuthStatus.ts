'use client';
import { useMemo } from 'react';

import { useAuth } from '@/contexts/auth';

/**
 * 为 RainbowKit 提供认证状态的 Hook
 * 返回 'loading' | 'unauthenticated' | 'authenticated'
 */
export const useAuthStatus = () => {
  const { token, isAuthenticated } = useAuth();
  
  const status = useMemo(() => {
    // 如果还未加载初始 token，显示 loading
    if (token === undefined) {
      return 'loading' as const;
    }
    
    // 如果有有效 token，用户已认证
    if (isAuthenticated) {
      return 'authenticated' as const;
    }
    
    // 否则用户未认证
    return 'unauthenticated' as const;
  }, [token, isAuthenticated]);

  return status;
};