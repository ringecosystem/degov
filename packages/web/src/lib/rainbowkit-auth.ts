"use client";
import { createAuthenticationAdapter } from "@rainbow-me/rainbowkit";

import { siweService } from "@/lib/auth/siwe-service";

// 用于跟踪 nonce 来源的 Map
const nonceSourceMap = new Map<string, 'generated' | 'remote'>();

/**
 * 为 RainbowKit 创建自定义认证适配器，集成现有后端
 * 该适配器使用统一的 siweService 处理 SIWE 认证流程
 * 根据 nonce 来源决定是否进行远程认证
 */
export const authenticationAdapter = createAuthenticationAdapter({
  getNonce: async () => {
    
    const { nonce, source } = await siweService.getNonce();
    // 保存 nonce 与来源的映射
    nonceSourceMap.set(nonce, source);
    return nonce;
  },

  createMessage: ({ nonce, address, chainId }) => {
    return siweService.createMessage({ address, nonce, chainId });
  },

  verify: async ({ message, signature }) => {
    // 从 SIWE 消息中解析地址和 nonce
    const lines = message.split('\n');
    const addressLine = lines.find(line => line.trim().match(/^0x[a-fA-F0-9]{40}$/));
    if (!addressLine) {
      console.error('Cannot parse address from SIWE message');
      return false;
    }
    const address = addressLine.trim() as `0x${string}`;
    
    // 解析 nonce
    const nonceLine = lines.find(line => line.startsWith('Nonce: '));
    const nonce = nonceLine?.replace('Nonce: ', '') || '';
    
    // 获取 nonce 来源
    const nonceSource = nonceSourceMap.get(nonce);
    
    const result = await siweService.verifySignature({ 
      message, 
      signature: signature as `0x${string}`, 
      address: address as `0x${string}`,
      nonceSource 
    });
    
    // 清理已使用的 nonce
    if (nonce) {
      nonceSourceMap.delete(nonce);
    }
    
    return result.success;
  },

  signOut: async () => {
    await siweService.signOut();
    // 清理所有 nonce 映射
    nonceSourceMap.clear();
  },
});