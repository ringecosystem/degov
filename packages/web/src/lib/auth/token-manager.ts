"use client";

const TOKEN_KEY = "degov_auth_token";
const REMOTE_TOKEN_KEY = "degov_remote_auth_token";

class TokenManager {
  getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  setToken(token: string | null): void {
    if (typeof window === "undefined") return;

    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  clearToken(): void {
    this.setToken(null);
  }

  getRemoteToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(REMOTE_TOKEN_KEY);
  }

  setRemoteToken(token: string | null): void {
    if (typeof window === "undefined") return;

    if (token) {
      localStorage.setItem(REMOTE_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(REMOTE_TOKEN_KEY);
    }
  }

  clearRemoteToken(): void {
    this.setRemoteToken(null);
  }

  clearAllTokens(): void {
    this.clearToken();
    this.clearRemoteToken();
  }

  hasValidFormat(): boolean {
    const token = this.getToken();
    return !!(token && token.length > 10);
  }

  hasValidRemoteFormat(): boolean {
    const token = this.getRemoteToken();
    return !!(token && token.length > 10);
  }
}

export const tokenManager = new TokenManager();

export const getToken = () => tokenManager.getToken();
export const setToken = (token: string | null) => tokenManager.setToken(token);
export const clearToken = () => tokenManager.clearToken();

export const getRemoteToken = () => tokenManager.getRemoteToken();
export const setRemoteToken = (token: string | null) =>
  tokenManager.setRemoteToken(token);
export const clearRemoteToken = () => tokenManager.clearRemoteToken();
