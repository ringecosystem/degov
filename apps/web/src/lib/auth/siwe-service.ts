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

export interface AuthStatusResult {
  authenticated: boolean;
  address?: string;
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

  async getNonce(params?: { address: `0x${string}`; chainId: number }): Promise<{
    nonce: string;
    source: "generated" | "remote";
    challengeId?: string;
    message?: string;
  }> {
    const response = await fetch("/api/auth/nonce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params ?? {}),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to get nonce");
    }

    const { data } = await response.json();
    return data;
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

  async getAuthStatus(address?: string): Promise<AuthStatusResult> {
    const response = await fetch("/api/auth/status", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    });

    if (!response.ok) {
      if (address) {
        tokenManager.clearToken(address);
      }
      return { authenticated: false };
    }

    const result = await response.json();
    const sessionAddress =
      typeof result?.data?.address === "string"
        ? result.data.address.toLowerCase()
        : undefined;
    const requestedAddress = address?.toLowerCase();
    const authenticated =
      Boolean(result?.data?.authenticated && sessionAddress) &&
      (!requestedAddress || sessionAddress === requestedAddress);

    if (authenticated) {
      tokenManager.setToken("authenticated", sessionAddress);
      return { authenticated: true, address: sessionAddress };
    }

    if (address) {
      tokenManager.clearToken(address);
    }

    return { authenticated: false };
  }

  async verifySignature(params: {
    message: string;
    signature: `0x${string}`;
    address: `0x${string}`;
    nonceSource?: "generated" | "remote";
    challengeId?: string;
  }): Promise<{
    success: boolean;
    token?: string;
    remoteToken?: string;
    error?: string;
  }> {
    try {
      const { message, signature, address, nonceSource, challengeId } = params;

      let localAuthenticated = false;
      let remoteToken: string | undefined;
      const errors: string[] = [];

      const localResult = await this.loginLocal(message, signature);
      if (localResult.success) {
        localAuthenticated = true;
      } else {
        errors.push(`Local login failed: ${localResult.error}`);
      }

      if (localAuthenticated && nonceSource === "remote") {
        const remoteResult = await this.loginRemote(challengeId, signature);
        if (remoteResult.success) {
          remoteToken = remoteResult.token;
        } else {
          errors.push(`Remote login failed: ${remoteResult.error}`);
        }
      }

      if (localAuthenticated && (nonceSource !== "remote" || remoteToken)) {
        tokenManager.setToken("authenticated", address);
        if (remoteToken) {
          tokenManager.setRemoteToken(remoteToken, address);
        }
        return {
          success: true,
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
      credentials: "same-origin",
    });

    const result = await response.json();

    if (result?.code === 0 && result?.data?.token) {
      return { success: true, token: result.data.token };
    }

    if (result?.code === 0 && result?.data?.authenticated) {
      return { success: true };
    }

    return {
      success: false,
      error: result.msg || "Local authentication failed",
    };
  }

  private async loginRemote(
    challengeId: string | undefined,
    signature: string
  ): Promise<{ success: boolean; token?: string; error?: string }> {
    const endpoint = degovGraphqlApi();
    if (!endpoint) {
      return { success: false, error: "Remote API endpoint not configured" };
    }

    if (!challengeId) {
      return { success: false, error: "Remote challenge ID is missing" };
    }

    const loginMutation = `
      mutation VerifyAuthChallenge($input: VerifyAuthChallengeInput!) {
        verifyAuthChallenge(input: $input) {
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
              challengeId,
              signature,
            },
          },
        }),
        cache: "no-store",
      });

      const result = await response.json();

      if (result.data?.verifyAuthChallenge?.token) {
        return {
          success: true,
          token: result.data.verifyAuthChallenge.token,
        };
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
    await fetch("/api/auth/logout", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
    }).catch(() => undefined);

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

      const { nonce, source, challengeId, message: remoteMessage } =
        await this.getNonce({ address, chainId });
      const message =
        remoteMessage ?? this.createMessage({ address, nonce, chainId });
      const signature = await signMessageAsync({ message });

      return await this.verifySignature({
        message,
        signature,
        address,
        nonceSource: source,
        challengeId,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }
}

export const siweService = SiweService.getInstance();
