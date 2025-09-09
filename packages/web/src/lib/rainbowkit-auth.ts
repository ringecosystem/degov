"use client";
import { createAuthenticationAdapter } from "@rainbow-me/rainbowkit";

import { siweService } from "@/lib/auth/siwe-service";

const nonceSourceMap = new Map<string, "generated" | "remote">();

export const authenticationAdapter = createAuthenticationAdapter({
  getNonce: async () => {
    const { nonce, source } = await siweService.getNonce();
    nonceSourceMap.set(nonce, source);
    return nonce;
  },

  createMessage: ({ nonce, address, chainId }) => {
    return siweService.createMessage({ address, nonce, chainId });
  },

  verify: async ({ message, signature }) => {
    const lines = message.split("\n");
    const addressLine = lines.find((line) =>
      line.trim().match(/^0x[a-fA-F0-9]{40}$/)
    );
    if (!addressLine) {
      console.error("Cannot parse address from SIWE message");
      return false;
    }
    const address = addressLine.trim() as `0x${string}`;

    const nonceLine = lines.find((line) => line.startsWith("Nonce: "));
    const nonce = nonceLine?.replace("Nonce: ", "") || "";

    const nonceSource = nonceSourceMap.get(nonce);

    const result = await siweService.verifySignature({
      message,
      signature: signature as `0x${string}`,
      address: address as `0x${string}`,
      nonceSource,
    });

    if (nonce) {
      nonceSourceMap.delete(nonce);
    }

    return result.success;
  },

  signOut: async () => {
    await siweService.signOut();
    nonceSourceMap.clear();
  },
});
