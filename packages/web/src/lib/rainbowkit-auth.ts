"use client";
import { createAuthenticationAdapter } from "@rainbow-me/rainbowkit";
import { createSiweMessage } from "viem/siwe";

import { tokenManager } from "@/lib/auth/token-manager";

/**
 * 为 RainbowKit 创建自定义认证适配器，集成现有后端
 * 该适配器使用现有的 API 处理 SIWE 认证流程
 */
export const authenticationAdapter = createAuthenticationAdapter({
  getNonce: async () => {
    const response = await fetch("/api/auth/nonce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    const { data } = await response.json();
    return data.nonce;
  },

  createMessage: ({ nonce, address, chainId }) => {
    return createSiweMessage({
      domain: window.location.host,
      address,
      statement: 'Sign in with Ethereum to DeGov.AI',
      uri: window.location.origin,
      version: '1',
      chainId,
      nonce,
    });
  },

  verify: async ({ message, signature }) => {
    const verifyRes = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, signature }),
      cache: "no-store",
    });
    const response = await verifyRes.json();
    
    if (response?.code === 0 && response?.data?.token) {
      // 使用统一的token管理器
      tokenManager.setToken(response.data.token);
      return true;
    }

    return false;
  },

  signOut: async () => {
    // 使用统一的token管理器
    tokenManager.clearToken();
  },
});
