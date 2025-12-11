import { getDefaultWallets, getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  talismanWallet,
  okxWallet,
  imTokenWallet,
  trustWallet,
  safeWallet,
  subWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { QueryClient } from "@tanstack/react-query";
import { cookieStorage, createStorage } from "wagmi";
import { mainnet } from "wagmi/chains";

import { createWagmiQueryConfig } from "@/utils/query-config";

import type { Chain } from "@rainbow-me/rainbowkit";

const { wallets } = getDefaultWallets();

export function createQueryClient() {
  return new QueryClient(createWagmiQueryConfig());
}

type WagmiConfig = ReturnType<typeof getDefaultConfig>;

const configCache = new Map<string, WagmiConfig>();

function chainFingerprint(chain: Chain) {
  // Stable, order-defined subset of chain metadata that affects wagmi config
  return JSON.stringify({
    id: chain.id,
    name: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: chain.rpcUrls,
    blockExplorers: chain.blockExplorers,
    contracts: chain.contracts,
    testnet: chain.testnet,
  });
}

export function createConfig({
  appName,
  projectId,
  chain,
}: {
  chain: Chain;
  appName: string;
  projectId: string;
}) {
  const cacheKey = `${projectId}-${chainFingerprint(chain)}`;
  const cachedConfig = configCache.get(cacheKey);
  if (cachedConfig) {
    return cachedConfig;
  }

  const config = getDefaultConfig({
    appName,
    projectId,
    chains: [mainnet, chain],
    wallets: [
      ...wallets,
      {
        groupName: "More",
        wallets: [
          talismanWallet,
          subWallet,
          okxWallet,
          imTokenWallet,
          trustWallet,
          safeWallet,
        ],
      },
    ],
    ssr: true,
    storage: createStorage({
      storage: cookieStorage,
    }),
  });

  configCache.set(cacheKey, config);
  return config;
}
