'use client';

const TOKEN_KEY = 'degov_auth_token';

class TokenManager {
  private listeners: Set<(token: string | null) => void> = new Set();

  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  setToken(token: string | null): void {
    if (typeof window === 'undefined') return;
    
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    
    // 通知所有监听器
    this.listeners.forEach(listener => listener(token));
  }

  clearToken(): void {
    this.setToken(null);
  }

  // 监听token变化
  subscribe(listener: (token: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // 检查token是否仍然有效
  async validateToken(): Promise<boolean> {
    const token = this.getToken();
    if (!token) return false;
    
    try {
      // 调用API验证token
      const response = await fetch('/api/auth/validate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        cache: 'no-store'
      });
      
      if (!response.ok) {
        // 如果返回401，token已失效
        if (response.status === 401) {
          this.clearToken();
          return false;
        }
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Token validation failed:', error);
      return false;
    }
  }

  // 检查token是否存在且格式正确
  hasValidFormat(): boolean {
    const token = this.getToken();
    return !!(token && token.length > 10); // 简单的格式检查
  }
}

// 创建单例实例
export const tokenManager = new TokenManager();

// 导出常用方法，保持向后兼容
export const getToken = () => tokenManager.getToken();
export const setToken = (token: string | null) => tokenManager.setToken(token);
export const clearToken = () => tokenManager.clearToken();
