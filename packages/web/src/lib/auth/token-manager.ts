"use client";

const TOKEN_KEY_PREFIX = "degov_auth_token";
const REMOTE_TOKEN_KEY_PREFIX = "degov_remote_auth_token";

class TokenManager {
  private getTokenKey(address?: string): string {
    if (!address) return TOKEN_KEY_PREFIX;
    return `${TOKEN_KEY_PREFIX}_${address.toLowerCase()}`;
  }

  private getRemoteTokenKey(address?: string): string {
    if (!address) return REMOTE_TOKEN_KEY_PREFIX;
    return `${REMOTE_TOKEN_KEY_PREFIX}_${address.toLowerCase()}`;
  }

  getToken(address?: string): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(this.getTokenKey(address));
  }

  setToken(token: string | null, address?: string): void {
    if (typeof window === "undefined") return;

    const key = this.getTokenKey(address);
    if (token) {
      localStorage.setItem(key, token);
    } else {
      localStorage.removeItem(key);
    }
  }

  clearToken(address?: string): void {
    this.setToken(null, address);
  }

  getRemoteToken(address?: string): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(this.getRemoteTokenKey(address));
  }

  setRemoteToken(token: string | null, address?: string): void {
    if (typeof window === "undefined") return;

    const key = this.getRemoteTokenKey(address);
    if (token) {
      localStorage.setItem(key, token);
    } else {
      localStorage.removeItem(key);
    }
  }

  clearRemoteToken(address?: string): void {
    this.setRemoteToken(null, address);
  }

  clearAllTokens(address?: string): void {
    this.clearToken(address);
    this.clearRemoteToken(address);
  }

  clearAllAddressTokens(): void {
    if (typeof window === "undefined") return;

    const keys = Object.keys(localStorage);
    const tokenKeys = keys.filter(
      (key) =>
        key.startsWith(TOKEN_KEY_PREFIX) ||
        key.startsWith(REMOTE_TOKEN_KEY_PREFIX)
    );

    tokenKeys.forEach((key) => localStorage.removeItem(key));
  }
}

export const tokenManager = new TokenManager();

export const getToken = (address?: string) => tokenManager.getToken(address);
export const clearToken = (address?: string) =>
  tokenManager.clearToken(address);

export const getRemoteToken = (address?: string) =>
  tokenManager.getRemoteToken(address);
export const clearRemoteToken = (address?: string) =>
  tokenManager.clearRemoteToken(address);
