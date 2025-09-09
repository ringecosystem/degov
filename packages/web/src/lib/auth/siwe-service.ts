"use client";
import { createSiweMessage } from "viem/siwe";

import { degovGraphqlApi } from "@/utils/remote-api";
import { tokenManager } from "./token-manager";

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
      domain: typeof window !== "undefined" ? window.location.host : "degov.ai",
      statement: "DeGov.AI wants you to sign in with your Ethereum account",
      uri:
        typeof window !== "undefined"
          ? window.location.origin
          : "https://degov.ai",
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

  async getNonce(): Promise<{ nonce: string; source: "generated" | "remote" }> {
    const response = await fetch("/api/auth/nonce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to get nonce");
    }

    const { data } = await response.json();
    return { nonce: data.nonce, source: data.source };
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
      version: "1",
      chainId,
      nonce,
    });
  }

  async verifySignature(params: {
    message: string;
    signature: `0x${string}`;
    address: `0x${string}`;
    nonceSource?: "generated" | "remote";
  }): Promise<{
    success: boolean;
    token?: string;
    remoteToken?: string;
    error?: string;
  }> {
    try {
      const { message, signature, address, nonceSource } = params;

      let localToken: string | undefined;
      let remoteToken: string | undefined;
      const errors: string[] = [];

      const localResult = await this.loginLocal(message, signature);
      if (localResult.success) {
        localToken = localResult.token;
        tokenManager.setToken(localToken!);
      } else {
        errors.push(`Local login failed: ${localResult.error}`);
      }

      if (nonceSource === "remote") {
        const remoteResult = await this.loginRemote(
          message,
          signature,
          address
        );
        if (remoteResult.success) {
          remoteToken = remoteResult.token;
          tokenManager.setRemoteToken(remoteToken!);
        } else {
          errors.push(`Remote login failed: ${remoteResult.error}`);
        }
      }

      if (localToken || remoteToken) {
        return {
          success: true,
          token: localToken,
          remoteToken,
          error: errors.length > 0 ? errors.join("; ") : undefined,
        };
      }

      return {
        success: false,
        error: errors.join("; ") || "Authentication failed",
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  private async loginLocal(
    message: string,
    signature: string
  ): Promise<{ success: boolean; token?: string; error?: string }> {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, signature }),
      cache: "no-store",
    });

    const result = await response.json();

    if (result?.code === 0 && result?.data?.token) {
      return { success: true, token: result.data.token };
    }

    return {
      success: false,
      error: result.msg || "Local authentication failed",
    };
  }

  private async loginRemote(
    message: string,
    signature: string,
    address: string
  ): Promise<{ success: boolean; token?: string; error?: string }> {
    const endpoint = degovGraphqlApi();
    if (!endpoint) {
      return { success: false, error: "Remote API endpoint not configured" };
    }

    const loginMutation = `
      mutation Login($input: LoginInput!) {
        login(input: $input) {
          token
        }
      }
    `;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: loginMutation,
          variables: {
            input: {
              signature,
              message,
            },
          },
        }),
        cache: "no-store",
      });

      const result = await response.json();

      if (result.data?.login?.token) {
        return { success: true, token: result.data.login.token };
      }

      return {
        success: false,
        error: result.errors?.[0]?.message || "Remote authentication failed",
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Remote authentication error",
      };
    }
  }

  async signOut(): Promise<void> {
    tokenManager.clearAllTokens();
    // Clear persisted react-query cache if present
    try {
      if (typeof window !== "undefined") {
        window.localStorage?.removeItem("REACT_QUERY_OFFLINE_CACHE");
      }
    } catch {}
  }

  async authenticateWithWallet(params: {
    address: `0x${string}`;
    chainId: number;
    signMessageAsync: (params: { message: string }) => Promise<`0x${string}`>;
  }): Promise<{
    success: boolean;
    token?: string;
    remoteToken?: string;
    error?: string;
  }> {
    try {
      const { address, chainId, signMessageAsync } = params;

      const { nonce, source } = await this.getNonce();
      const message = this.createMessage({ address, nonce, chainId });
      const signature = await signMessageAsync({ message });

      return await this.verifySignature({
        message,
        signature,
        address,
        nonceSource: source,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }
}

export const siweService = SiweService.getInstance();
