"use client";
import { createAuthenticationAdapter } from "@rainbow-me/rainbowkit";

import { siweService } from "@/lib/auth/siwe-service";

/**
 * 为 RainbowKit 创建自定义认证适配器，集成现有后端
 * 该适配器使用统一的 siweService 处理 SIWE 认证流程
 */
export const authenticationAdapter = createAuthenticationAdapter({
  getNonce: async () => {
    return await siweService.getNonce();
  },

  createMessage: ({ nonce, address, chainId }) => {
    return siweService.createMessage({ address, nonce, chainId });
  },

  verify: async ({ message, signature }) => {
    const result = await siweService.verifySignature({ message, signature });
    return result.success;
  },

  signOut: async () => {
    await siweService.signOut();
  },
});
