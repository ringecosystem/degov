"use client";

class TokenManager {
  private authenticatedAddresses = new Set<string>();
  private remoteTokens = new Map<string, string>();

  private normalizeAddress(address?: string): string {
    return address?.toLowerCase() ?? "";
  }

  getToken(address?: string): string | null {
    return this.isAuthenticated(address) ? "cookie" : null;
  }

  isAuthenticated(address?: string): boolean {
    return this.authenticatedAddresses.has(this.normalizeAddress(address));
  }

  setToken(token: string | null, address?: string): void {
    if (token) {
      this.authenticatedAddresses.add(this.normalizeAddress(address));
    } else {
      this.authenticatedAddresses.delete(this.normalizeAddress(address));
    }
  }

  clearToken(address?: string): void {
    this.setToken(null, address);
  }

  getRemoteToken(address?: string): string | null {
    return this.remoteTokens.get(this.normalizeAddress(address)) ?? null;
  }

  setRemoteToken(token: string | null, address?: string): void {
    if (token) {
      this.remoteTokens.set(this.normalizeAddress(address), token);
    } else {
      this.remoteTokens.delete(this.normalizeAddress(address));
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
    this.authenticatedAddresses.clear();
    this.remoteTokens.clear();
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
