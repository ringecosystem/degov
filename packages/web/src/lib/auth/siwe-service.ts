'use client';
import { createSiweMessage } from 'viem/siwe';

import { tokenManager } from './token-manager';

export interface SiweAuthConfig {
  domain?: string;
  statement?: string;
  uri?: string;
  version?: string;
}

export class SiweService {
  private static instance: SiweService;
  private config: SiweAuthConfig;

  private constructor() {
    this.config = {
      domain: typeof window !== 'undefined' ? window.location.host : 'degov.ai',
      statement: 'DeGov.AI wants you to sign in with your Ethereum account',
      uri: typeof window !== 'undefined' ? window.location.origin : 'https://degov.ai',
    };
  }

  static getInstance(): SiweService {
    if (!SiweService.instance) {
      SiweService.instance = new SiweService();
    }
    return SiweService.instance;
  }

  updateConfig(config: Partial<SiweAuthConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async getNonce(): Promise<string> {
    const response = await fetch('/api/auth/nonce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error('Failed to get nonce');
    }

    const { data } = await response.json();
    return data.nonce;
  }

  createMessage(params: {
    address: `0x${string}`;
    nonce: string;
    chainId: number;
  }): string {
    const { address, nonce, chainId } = params;

    return createSiweMessage({
      domain: this.config.domain!,
      address,
      statement: `${this.config.statement}: ${address}`,
      uri: this.config.uri!,
      version:  '1',
      chainId,
      nonce,
    });
  }

  async verifySignature(params: {
    message: string;
    signature: `0x${string}`;
  }): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
      const { message, signature } = params;

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, signature }),
        cache: 'no-store',
      });

      const result = await response.json();

      if (result?.code === 0 && result?.data?.token) {
        tokenManager.setToken(result.data.token);
        return { success: true, token: result.data.token };
      }

      return { success: false, error: result.msg || 'Authentication failed' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  async signOut(): Promise<void> {
    tokenManager.clearToken();
  }

  async authenticateWithWallet(params: {
    address: `0x${string}`;
    chainId: number;
    signMessageAsync: (params: { message: string }) => Promise<`0x${string}`>;
  }): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
      const { address, chainId, signMessageAsync } = params;

      const nonce = await this.getNonce();
      const message = this.createMessage({ address, nonce, chainId });
      const signature = await signMessageAsync({ message });

      return await this.verifySignature({ message, signature });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }
}

export const siweService = SiweService.getInstance();